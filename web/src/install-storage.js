// Side-effect module. Imported FIRST by main.jsx so the shim is installed before the game
// module's body evaluates. ES import order is source order, so this is a hard guarantee rather
// than a "the core probably doesn't read storage at module scope" assumption.
import { installStorageShim } from './storage-shim.js';
installStorageShim();
