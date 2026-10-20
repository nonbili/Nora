/**
 * The requests of the feed, with the headers and cookies it chooses; on desktop they are made
 * by the main process, as the window can't send those.
 */
export const watchFetch = (url: string, init: RequestInit = {}): Promise<Response> => fetch(url, init)
