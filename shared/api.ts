// The single response envelope every API endpoint returns. Importing it on both
// sides keeps the client and server honest about the wire shape.
//   success: did the request succeed?
//   data:    the payload on success (null on error)
//   error:   a human-readable message on failure (null on success)
//   meta:    pagination metadata for list endpoints (optional)
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}
