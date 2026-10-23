const CACHE_NAME = 'ian-class-mgmt-v5.2.0';
const urlsToCache = [
  './index.html',
  './parent.html',
  './student.html',
  './manifest.json',
  './css/style.css',
  './css/aurora-theme.css',
  './js/shared/config.js',
  './js/parent/app.js',
  './js/student/app.js',
  './js/app.js',
  './js/constants.js',
  './js/events.js',
  './js/examScores.js',
  './js/firebase.js',
  './js/icons.js',
  './js/navigation.js',
  './js/qrLogin.js',
  './js/render.js',
  './js/state.js',
  './js/storage.js',
  './js/utils.js',
  './js/modules/classWizard.js',
  './js/modules/attendanceHub.js',
  './js/modules/smartBoard.js',
  './js/modules/arenaDrawAndPoints.js',
  './js/modules/classroomStudio.js',
  './js/modules/examTimer.js',
  './js/modules/dynamicIsland.js',
  './assets/images/bg_homework_hub.jpg',
  './assets/images/bg_attendance_hub.jpg',
  './assets/images/bg_arena_draw_points.jpg',
  './assets/images/bg_seating_groups.jpg',
  './assets/images/bg_exam_timer.jpg',
  './assets/images/bg_contact_blackboard.jpg',
  './assets/images/banner_classroom.jpg',
  './assets/images/banner_attendance.jpg',
  './assets/images/banner_quiz_stage.jpg',
  './assets/images/banner_seating_grouping.jpg',
  './assets/images/banner_exam_timer.jpg',
  './assets/images/empty_homework_done.jpg',
  './assets/images/empty_no_classes.jpg',
  './js/lib/qrcode.min.js',
  './js/lib/html5-qrcode.min.js',
  './icon.svg',
  './icon.png',
  './homework-checker-icon.svg',
  './homework-checker-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        urlsToCache.map(url => cache.add(url).catch(e => console.warn('快取失敗:', url, e)))
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('清除舊版本快取:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // 只攔截同源 GET 請求，第三方 CDN 與 Firebase 不強制快取干預
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // 網路優先策略 (Network First, Cache Fallback)，確保最新代碼即時生效
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, resClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return (await caches.match('./index.html')) || (await caches.match('./parent.html')) || (await caches.match('./student.html'));
        }
        return new Response('離線模式，此資源未快取', { status: 503, statusText: 'Offline' });
      })
  );
});
