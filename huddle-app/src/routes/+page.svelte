<script lang="ts">
	let { data } = $props();
</script>

<div class="section-pad">
	{#if data.session}
		<p>Welcome, {data.session.user.email}</p>
	{:else}
		<p class="text-[var(--color-text-muted)]">You're not logged in.</p>
	{/if}
</div>
