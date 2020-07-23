import Vue from 'vue'
import VueRouter, { RouteConfig } from 'vue-router'
import Demo from '../views/Demo.vue'

Vue.use(VueRouter)

const routes: Array<RouteConfig> = [
  {
    path: '/',
    name: 'Demo',
    component: Demo
  }
]

const router = new VueRouter({
  routes
})

export default router
