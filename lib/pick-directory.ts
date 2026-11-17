// Only Android picks a download folder; elsewhere there is no picker.
export const pickDirectory = async (_initialUri: string | null): Promise<string | null> => null
