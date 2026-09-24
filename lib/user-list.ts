/**
 * Contract for the keyset-paginated active-user list (`/api/users/list`).
 *
 * The response body stays an array for backwards compatibility with already
 * installed PWA clients; the opaque next-page cursor travels in a header so old
 * clients keep working (they simply see the first page) while new clients can
 * keep loading.
 */
export const USER_LIST_NEXT_CURSOR_HEADER = "X-Next-Cursor";

/** Default and maximum page size for `/api/users/list`. */
export const USER_LIST_CLIENT_PAGE_SIZE = 50;

/** Read the next-page cursor from a paginated user-list response. */
export function readNextUserListCursor(response: Response): string | null {
  return response.headers.get(USER_LIST_NEXT_CURSOR_HEADER);
}
