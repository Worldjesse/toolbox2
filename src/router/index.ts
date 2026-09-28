import { createMemoryHistory, createRouter } from 'vue-router'
import { toolRegistry } from '@/tools/registry'

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
      ...toolRegistry.map(tool => ({
        path: tool.path.slice(1),
        name: `tools-${tool.id}`,
        component: tool.component,
      })),
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
