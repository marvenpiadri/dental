import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({ selector: 'ds-root', imports: [RouterOutlet], template: '<router-outlet />' })
export class Root {}
