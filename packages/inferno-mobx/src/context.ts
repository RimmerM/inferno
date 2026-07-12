import { createContext } from 'inferno';

export const mobxStoresContext = createContext<Record<string, any>>({});
