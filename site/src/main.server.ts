import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { Root } from './app/root';
import { serverConfig } from './app/app.config.server';

export default (context: BootstrapContext) => bootstrapApplication(Root, serverConfig, context);
