/**
 * Thin fetch wrapper for /modshub/api. Same-origin only: the admin JWT lives
 * in an httpOnly SameSite=Strict cookie, so no token is ever handled by JS.
 */

const BASE = '/modshub/api';

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || `Request failed (${status})`);
    this.status = status;
    this.code = body && body.error;
    this.details = body && body.details;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(cause) {
    super('Cannot reach the server');
    this.cause = cause;
    this.offline = true;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, { json, body, headers = {}, expect = [200, 201] } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
  } catch (error) {
    throw new NetworkError(error);
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = null;
    }
  }
  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(401, data || { message: 'Please sign in again' });
  }
  if (!expect.includes(res.status) && !res.ok) throw new ApiError(res.status, data);
  return { status: res.status, data };
}

/** Posts as sent to the API: only editable fields. */
function wirePost(post) {
  return {
    title: post.title,
    scheduledAt: post.scheduledAt,
    timezone: post.timezone,
    status: post.status,
    category: post.category,
    tags: post.tags,
    content: post.content,
    image: post.image,
    images: post.images || (post.image ? [post.image] : []),
    notes: post.notes,
    discord: post.discord || null,
    createdAt: post.createdAt || undefined,
  };
}

export const api = {
  async bootstrap() {
    return (await request('GET', '/bootstrap')).data;
  },

  /** @returns {Promise<{status:'ok', post: object} | {status:'conflict', server: object|null}>} */
  async savePost(post, baseRevision) {
    try {
      const { data } = await request('PUT', `/posts/${encodeURIComponent(post.id)}`, {
        json: { post: wirePost(post), baseRevision },
      });
      return { status: 'ok', post: data.post };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        return { status: 'conflict', server: (error.body && error.body.server) || null };
      }
      throw error;
    }
  },

  async putSlot(slot) {
    const { data } = await request('PUT', `/slots/${encodeURIComponent(slot.id)}`, {
      json: { slot: { date: slot.date, time: slot.time || '', timezone: slot.timezone, note: slot.note || '' } },
    });
    return data.slot;
  },

  async deleteSlot(id) {
    await request('DELETE', `/slots/${encodeURIComponent(id)}`);
  },

  async deletePost(id) {
    await request('DELETE', `/posts/${encodeURIComponent(id)}`);
  },

  async importPosts(posts, onConflict) {
    const { data } = await request('POST', '/posts/import', { json: { posts, onConflict } });
    return data.results;
  },

  async bulkPatch(ids, patch) {
    const { data } = await request('POST', '/posts/bulk', { json: { action: 'patch', ids, patch } });
    return data.posts;
  },

  async bulkDelete(ids) {
    const { data } = await request('POST', '/posts/bulk', { json: { action: 'delete', ids } });
    return data.deleted;
  },

  async saveSettings(settings, baseRevision) {
    try {
      const { data } = await request('PUT', '/settings', { json: { settings, baseRevision } });
      return { status: 'ok', settings: data.settings };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        return { status: 'conflict', server: error.body && error.body.server };
      }
      throw error;
    }
  },

  /** @param {Blob} file png/jpeg/webp/gif */
  async uploadAsset(file, name = '') {
    const { data } = await request('POST', '/assets', {
      body: file,
      headers: {
        'Content-Type': file.type,
        ...(name ? { 'X-Filename': encodeURIComponent(name) } : {}),
      },
    });
    return data;
  },
};

export function describeError(error) {
  if (error instanceof NetworkError) return 'You appear to be offline. Changes are kept on this device and will be sent when the connection is back.';
  if (error instanceof ApiError) {
    if (error.details && error.details.length) return `${error.message}: ${error.details.map((d) => `${d.path} ${d.message}`).join('; ')}`;
    return error.message;
  }
  return error && error.message ? error.message : 'Unexpected error';
}
