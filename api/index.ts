import { handleRequest } from '../backend/src/app.ts';

export default { fetch(request: Request) { return handleRequest(request); } };
