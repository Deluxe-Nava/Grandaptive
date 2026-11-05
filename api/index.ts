import { handleRequest } from '../server/app.ts';

export default { fetch(request: Request) { return handleRequest(request); } };
