/* 홈 화면에 추가(앱처럼 설치)를 위한 최소 서비스워커. 캐시는 하지 않아서 배포하면 항상 최신 화면이 나와요. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
