(async function () {
  'use strict';
  const A = window.App, $ = A.$;
  const p = await A.guard({ roles: ['admin', 'office'] });
  if (p.role === 'admin') $('#admin-link').style.display = 'inline';
  $('#logout-link').addEventListener('click', e => { e.preventDefault(); A.logout(); });
})();
