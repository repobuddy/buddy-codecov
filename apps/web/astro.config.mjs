import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://repobuddy.github.io',
	base: '/buddy-codecov',
	integrations: [
		starlight({
			title: 'Buddy Codecov',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/repobuddy/buddy-codecov' }],
			sidebar: [{ label: 'Guide', items: [{ label: 'Overview', link: '/' }] }],
			editLink: { baseUrl: 'https://github.com/repobuddy/buddy-codecov/edit/main/apps/web/' },
		}),
	],
})
