// Every error response has this shape (see docs/08-api-routes.md).
export interface ApiError {
  error: string;
  code: string;
}
