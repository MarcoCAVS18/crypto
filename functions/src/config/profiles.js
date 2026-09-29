// Perfiles habilitados (mismos ids que frontend/src/data/profiles.js). Solo estos pueden crear un PIN.
export const KNOWN_PROFILES = Object.freeze(['marco', 'tomas', 'victor']);
export const isKnownProfile = (id) => KNOWN_PROFILES.includes(id);
