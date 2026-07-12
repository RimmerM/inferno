import { createContext } from 'inferno';

export const reduxContext = createContext<Record<string, any>>({});
