<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<nav class="topnav">
	<a href={resolve('/')} class="flex items-center gap-2.5">
		<span class="mark"></span>
		<span class="font-bold">huddle</span>
	</a>
	{#if data.session}
		<div class="flex items-center gap-3.5 text-sm">
			<a href={resolve('/events/new')} class="btn btn-primary btn-sm">+ New Event</a>
			<span class="text-[var(--color-text-muted)]">{data.session.user.email}</span>
			<form method="POST" action="/logout">
				<button type="submit" class="btn btn-ghost btn-sm">Log out</button>
			</form>
		</div>
	{:else}
		<div class="flex items-center gap-2.5">
			<a href={resolve('/login')} class="btn btn-ghost btn-sm">Log in</a>
			<a href={resolve('/signup')} class="btn btn-primary btn-sm">Sign up</a>
		</div>
	{/if}
</nav>

{@render children()}
