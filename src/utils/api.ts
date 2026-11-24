export async function parseApiJson<T>(res: Response, fallbackError: string): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'The backend API server is not running on this host. Start the Node server (npm start) or open the hosted studio URL to run live AI generation.'
    );
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data && data.error) || fallbackError);
  }
  return data as T;
}
