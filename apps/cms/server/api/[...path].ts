// Any /api path no route claims is a 404, not the SPA shell with a 200.
export default defineEventHandler(() => fail(404, 'not_found', 'No such route'))
