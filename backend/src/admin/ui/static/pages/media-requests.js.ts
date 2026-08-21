// Media Requests page JS (served at /admin/static/js/pages/media-requests.js).
// Reads inline data: window.ppRequests.
export const MEDIA_REQUESTS_JS = String.raw`
document.addEventListener('DOMContentLoaded', function () {
  if (!window.L || !window.ppRequests) return;
  var reqs = window.ppRequests;
  var map = L.map('ppMap').setView([52.1, 19.3], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  var group = L.featureGroup();
  reqs.forEach(function (r) {
    var color = r.active ? '#206bc4' : '#8d99ab';
    var ic = L.divIcon({ className: '', html: '<div style="width:12px;height:12px;background:' + color + ';border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
    var m = L.marker([r.lat, r.lng], { icon: ic }).addTo(group);
    m.bindPopup('<strong>' + r.user + '</strong><br>' + r.city + '<br>' + new Date(r.at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }) + '<br>' + r.lat.toFixed(4) + ', ' + r.lng.toFixed(4) + '<br>' + (r.active ? '<span class="text-success">aktywne</span>' : '<span class="text-muted">wygasłe</span>'));
  });
  group.addTo(map);
  try { map.fitBounds(group.getBounds().pad(0.2)); } catch (e) { map.setView([52.1, 19.3], 6); }
});
`;
