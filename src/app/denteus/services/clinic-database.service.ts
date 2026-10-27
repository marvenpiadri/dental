import { Injectable } from '@angular/core';
import { Appointment, Chair, Dentist, Patient, PatientDocument } from '../models/dental.models';

const DATABASE_NAME = 'dental-clinic';
const DATABASE_VERSION = 3;

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
        if (!db.objectStoreNames.contains('locations')) db.createObjectStore('locations', { keyPath: 'id' });
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
        const documents = db.objectStoreNames.contains('documents')
          ? request.transaction!.objectStore('documents')
          : db.createObjectStore('documents', { keyPath: 'id' });
        if (!documents.indexNames.contains('patientId')) documents.createIndex('patientId', 'patientId', { unique: false }); // added in v3
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

  async loadLocations(): Promise<{ id: string; name: string; code: string; address?: string; timezone: string; active: boolean }[]> {
    const db = await this.open();
    const transaction = db.transaction('locations', 'readonly');
    const done = transactionDone(transaction);
    const result = await requestResult<{ id: string; name: string; code: string; address?: string; timezone: string; active: boolean }[]>(transaction.objectStore('locations').getAll());
    await done;
    return result;
  }

  async saveLocations(locations: { id: string; name: string; code: string; address?: string; timezone: string; active: boolean }[]): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction('locations', 'readwrite');
    const store = transaction.objectStore('locations');
    store.clear();
    locations.forEach((location) => store.put(location));
    await transactionDone(transaction);
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

  async addDocument(doc: PatientDocument): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction('documents', 'readwrite');
    transaction.objectStore('documents').put(doc);
    await transactionDone(transaction);
  }

  async listDocuments(patientId: string): Promise<PatientDocument[]> {
    const db = await this.open();
    const transaction = db.transaction('documents', 'readonly');
    const done = transactionDone(transaction);
    const docs = await requestResult<PatientDocument[]>(transaction.objectStore('documents').index('patientId').getAll(patientId));
    await done;
    return docs.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  async allDocuments(): Promise<PatientDocument[]> {
    const db = await this.open();
    const transaction = db.transaction('documents', 'readonly');
    const done = transactionDone(transaction);
    const docs = await requestResult<PatientDocument[]>(transaction.objectStore('documents').getAll());
    await done;
    return docs;
  }

  /** One transaction: a failure leaves the old documents in place. */
  async replaceDocuments(docs: PatientDocument[]): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction('documents', 'readwrite');
    transaction.objectStore('documents').clear();
    for (const doc of docs) transaction.objectStore('documents').put(doc);
    await transactionDone(transaction);
  }

  async deleteDocument(id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction('documents', 'readwrite');
    transaction.objectStore('documents').delete(id);
    await transactionDone(transaction);
  }

  /** Small clinic-wide values (the act catalog) live in the `settings` store as `{ id, value }`. */
  async loadSetting<T>(id: string): Promise<T | undefined> {
    const db = await this.open();
    const transaction = db.transaction('settings', 'readonly');
    const done = transactionDone(transaction);
    const row = await requestResult<{ value: T } | undefined>(transaction.objectStore('settings').get(id));
    await done;
    return row?.value;
  }

  async saveSetting(id: string, value: unknown): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction('settings', 'readwrite');
    transaction.objectStore('settings').put({ id, value });
    await transactionDone(transaction);
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
