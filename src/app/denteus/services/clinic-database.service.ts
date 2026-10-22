import { Injectable } from '@angular/core';
import { Appointment, Chair, Dentist, Patient } from '../models/dental.models';

const DATABASE_NAME = 'dental-clinic';
const DATABASE_VERSION = 2;

interface StoredRecord {
  id: string;
  [key: string]: unknown;
}

interface PersistedSnapshot {
  patients: Patient[];
  appointments: Appointment[];
}

@Injectable({ providedIn: 'root' })
export class ClinicDatabase {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is unavailable in this browser context.'));
    }
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains('locations')) db.deleteObjectStore('locations');
        if (!db.objectStoreNames.contains('dentists')) db.createObjectStore('dentists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chairs')) db.createObjectStore('chairs', { keyPath: 'id' });

        if (!db.objectStoreNames.contains('patients')) {
          const store = db.createObjectStore('patients', { keyPath: 'id' });
          store.createIndex('fullName', 'fullName', { unique: false });
        }
        if (!db.objectStoreNames.contains('appointments')) {
          const store = db.createObjectStore('appointments', { keyPath: 'id' });
          store.createIndex('start', 'start', { unique: false });
          store.createIndex('patientId', 'patientId', { unique: false });
          store.createIndex('dentistId', 'dentistId', { unique: false });
          store.createIndex('chairId', 'chairId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('clinicalRecords')) db.createObjectStore('clinicalRecords', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('auditEvents')) db.createObjectStore('auditEvents', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.databasePromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        this.databasePromise = null;
        reject(request.error ?? new Error('Could not open the clinic database.'));
      };
      request.onblocked = () => reject(new Error('The clinic database upgrade is blocked by another open tab.'));
    });
    return this.databasePromise;
  }

  async loadSchedulingSnapshot(): Promise<PersistedSnapshot> {
    const db = await this.open();
    const transaction = db.transaction(['patients', 'appointments'], 'readonly');
    const patientsRequest = transaction.objectStore('patients').getAll();
    const appointmentsRequest = transaction.objectStore('appointments').getAll();
    const transactionComplete = transactionDone(transaction);

    const patients = await requestResult<Patient[]>(patientsRequest);
    const appointments = await requestResult<StoredRecord[]>(appointmentsRequest);
    await transactionComplete;

    return {
      patients,
      appointments: appointments.map((appointment) => ({
        ...appointment,
        start: asDate(appointment['start']),
        end: asDate(appointment['end']),
        createdAt: asDate(appointment['createdAt']),
        history: Array.isArray(appointment['history'])
          ? (appointment['history'] as Array<Record<string, unknown>>).map((entry) => ({ ...entry, at: asDate(entry['at']) }))
          : [],
        scheduleHistory: Array.isArray(appointment['scheduleHistory'])
          ? (appointment['scheduleHistory'] as Array<Record<string, unknown>>).map((entry) => ({
              ...entry,
              at: asDate(entry['at']),
              fromStart: asDate(entry['fromStart']),
              toStart: asDate(entry['toStart']),
            }))
          : [],
      })) as unknown as Appointment[],
    };
  }

  async saveSchedulingSnapshot(patients: Patient[], appointments: Appointment[]): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(['patients', 'appointments'], 'readwrite');
    const patientStore = transaction.objectStore('patients');
    const appointmentStore = transaction.objectStore('appointments');

    patientStore.clear();
    appointmentStore.clear();
    for (const patient of patients) patientStore.put(patient);
    for (const appointment of appointments) {
      appointmentStore.put({
        ...appointment,
        start: appointment.start.toISOString(),
        end: appointment.end.toISOString(),
        createdAt: appointment.createdAt.toISOString(),
        history: appointment.history.map((entry) => ({ ...entry, at: entry.at.toISOString() })),
        scheduleHistory: appointment.scheduleHistory.map((entry) => ({
          ...entry,
          at: entry.at.toISOString(),
          fromStart: entry.fromStart.toISOString(),
          toStart: entry.toStart.toISOString(),
        })),
      });
    }
    await transactionDone(transaction);
  }

  async saveResources(dentists: Dentist[], chairs: Chair[]): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(['dentists', 'chairs'], 'readwrite');
    const dentistStore = transaction.objectStore('dentists');
    const chairStore = transaction.objectStore('chairs');
    dentistStore.clear();
    chairStore.clear();
    dentists.forEach((dentist) => dentistStore.put(dentist));
    chairs.forEach((chair) => chairStore.put(chair));
    await transactionDone(transaction);
  }

  async loadResources(): Promise<{ dentists: Dentist[]; chairs: Chair[] }> {
    const db = await this.open();
    const transaction = db.transaction(['dentists', 'chairs'], 'readonly');
    const transactionComplete = transactionDone(transaction);
    const dentists = await requestResult<Dentist[]>(transaction.objectStore('dentists').getAll());
    const chairs = await requestResult<Chair[]>(transaction.objectStore('chairs').getAll());
    await transactionComplete;
    return { dentists, chairs };
  }

  async clearSchedulingData(): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(['patients', 'appointments'], 'readwrite');
    transaction.objectStore('patients').clear();
    transaction.objectStore('appointments').clear();
    await transactionDone(transaction);
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}
