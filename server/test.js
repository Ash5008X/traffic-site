const http = require('http');

const data = JSON.stringify({
  name: 'Test',
  email: 'test@example.com',
  password: 'password',
  role: 'user'
});

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    let token = '';
    try {
      token = JSON.parse(body).token;
    } catch(e) {}
    if (!token) {
      console.log('Failed to register/get token. Response:', body);
      // try logging in
      const loginData = JSON.stringify({ email: 'test@example.com', password: 'password', role: 'user' });
      const loginReq = http.request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': loginData.length
        }
      }, (res2) => {
        let body2 = '';
        res2.on('data', d => body2 += d);
        res2.on('end', () => {
          token = JSON.parse(body2).token;
          if (token) testCreate(token);
          else console.log('Login failed:', body2);
        });
      });
      loginReq.write(loginData);
      loginReq.end();
      return;
    }
    testCreate(token);
  });
});
req.write(data);
req.end();

function testCreate(token) {
  const incidentData = JSON.stringify({
    type: 'Medical',
    severity: 'Medium',
    location: {
      address: 'Block 34, LPU',
      lat: 34.053,
      lng: -118.241
    },
    description: 'A student fainted due to high heat'
  });

  const req2 = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/incidents',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': incidentData.length,
      'Authorization': `Bearer ${token}`
    }
  }, (res2) => {
    let body2 = '';
    res2.on('data', d => body2 += d);
    res2.on('end', () => {
      console.log('Incident Post Response Status:', res2.statusCode);
      console.log('Incident Post Response Body:', body2);
    });
  });
  req2.write(incidentData);
  req2.end();
}
