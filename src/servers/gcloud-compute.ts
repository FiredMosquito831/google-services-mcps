#!/usr/bin/env node
import { runServer } from '../core/tools.js';
import { discoveryToolsFor } from '../core/discovery/tools.js';

await runServer({ name: 'gcloud-compute', version: '0.1.0', buildTools: (cfg) => discoveryToolsFor('gcloud-compute', cfg) });
