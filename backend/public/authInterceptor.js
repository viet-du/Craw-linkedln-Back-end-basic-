let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await response.json();
  if (data.success) {
    localStorage.setItem('token', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    return data.data.accessToken;
  }
  throw new Error('Refresh failed');
}

async function authFetch(url, options = {}) {
  let token = localStorage.getItem('token');
  options.headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  };

  let response = await fetch(url, options);

  if (response.status === 401) {
    const data = await response.clone().json();
    const errorCode = data.code || data.error?.code;

    if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'TOKEN_REVOKED') {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const newToken = await refreshToken();
          processQueue(null, newToken);
          options.headers['Authorization'] = `Bearer ${newToken}`;
          response = await fetch(url, options);
        } catch (err) {
          processQueue(err, null);
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login.html';
          return;
        } finally {
          isRefreshing = false;
        }
      } else {
        const newToken = await new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
        options.headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, options);
      }
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login.html';
    }
  }
  return response;
}

// Hàm logout toàn cục
window.logout = async function () {
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');
  if (token) {
    try {
      await authFetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  window.location.href = '/';
};

// Không ghi đè fetch toàn cục