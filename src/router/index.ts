import { createMemoryHistory, createRouter } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/home',
    children: [
      {
        path: 'home',
        name: 'home',
        component: () => import('@/pages/home.vue'),
      },
      {
        path: 'tools/json',
        name: 'tools-json',
        component: () => import('@/pages/tools/json.vue'),
      },
      {
        path: 'tools/timestamp',
        name: 'tools-timestamp',
        component: () => import('@/pages/tools/timestamp.vue'),
      },
      {
        path: 'tools/base64',
        name: 'tools-base64',
        component: () => import('@/pages/tools/base64.vue'),
      },
      {
        path: 'tools/uuid',
        name: 'tools-uuid',
        component: () => import('@/pages/tools/uuid.vue'),
      },
      {
        path: 'tools/text',
        name: 'tools-text',
        component: () => import('@/pages/tools/text.vue'),
      },
      {
        path: 'tools/http',
        name: 'tools-http',
        component: () => import('@/pages/tools/http.vue'),
      },
      {
        path: 'tools/file',
        name: 'tools-file',
        component: () => import('@/pages/tools/file.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/pages/settings.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createMemoryHistory(),
  routes,
})

export default router
