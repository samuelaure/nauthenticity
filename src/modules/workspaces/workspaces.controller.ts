import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const CENTRAL_API_URL = 'https://api.9nau.com';

export const workspacesController = async (fastify: FastifyInstance) => {
  const proxyRequest = async (
    request: FastifyRequest,
    reply: FastifyReply,
    endpoint: string,
    method: string = 'GET',
  ) => {
    const cookieHeader = request.headers.cookie || '';
    const token = cookieHeader
      .split(';')
      .find((c) => c.trim().startsWith('nau_token='))
      ?.split('=')[1];

    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized: No token found' });
    }

    try {
      const response = await fetch(`${CENTRAL_API_URL}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: method !== 'GET' && method !== 'DELETE' ? JSON.stringify(request.body) : undefined,
      });

      const data = await response.json().catch(() => ({}));
      return reply.status(response.status).send(data);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Proxy failed' });
    }
  };

  // List all workspaces for current user
  fastify.get('/workspaces', (req, rep) => proxyRequest(req, rep, '/workspaces'));

  // Get members of a specific workspace
  fastify.get('/workspaces/:id/members', (req, rep) => {
    const { id } = req.params as { id: string };
    return proxyRequest(req, rep, `/workspaces/${id}/members`);
  });

  // Rename workspace
  fastify.patch('/workspaces/:id', (req, rep) => {
    const { id } = req.params as { id: string };
    return proxyRequest(req, rep, `/workspaces/${id}`, 'PATCH');
  });

  // Update member role
  fastify.put('/workspaces/:id/members/:userId', (req, rep) => {
    const { id, userId } = req.params as { id: string; userId: string };
    return proxyRequest(req, rep, `/workspaces/${id}/members/${userId}`, 'PUT');
  });

  // Add member
  fastify.post('/workspaces/:id/members', (req, rep) => {
    const { id } = req.params as { id: string };
    return proxyRequest(req, rep, `/workspaces/${id}/members`, 'POST');
  });

  // Remove member
  fastify.delete('/workspaces/:id/members/:userId', (req, rep) => {
    const { id, userId } = req.params as { id: string; userId: string };
    return proxyRequest(req, rep, `/workspaces/${id}/members/${userId}`, 'DELETE');
  });

  // Get brands for workspace
  fastify.get('/workspaces/:id/brands', (req, rep) => {
    const { id } = req.params as { id: string };
    return proxyRequest(req, rep, `/workspaces/${id}/brands`);
  });
};
