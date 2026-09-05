<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();

	const covers = [
		'linear-gradient(135deg,#52525b,#d4d4d8)',
		'linear-gradient(135deg,#3f3f46,#a1a1aa)',
		'linear-gradient(120deg,#71717a,#e4e4e7)',
		'linear-gradient(150deg,#27272a,#a1a1aa)',
		'linear-gradient(135deg,#a1a1aa,#3f3f46)'
	];

	function formatDate(iso: string) {
		return new Date(iso).toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="section-pad">
	<h2 class="pg-title">Browse Events</h2>
	<p class="pg-sub">Find something to join, newest first.</p>

	{#if data.events.length === 0}
		<div class="empty-state">
			<div class="ico">✦</div>
			<h3>No events yet</h3>
			<p>Be the first to post one.</p>
			<a href={resolve('/events/new')} class="btn btn-primary">Create the first one</a>
		</div>
	{:else}
		<div class="grid-events">
			{#each data.events as event, i (event.id)}
				<a href={resolve('/events/[id=uuid]', { id: event.id })} class="event-card">
					<div class="cover" style="background:{covers[i % covers.length]}">
						<div class="cat">{event.category?.name ?? 'Uncategorized'}</div>
					</div>
					<div class="ecard-body">
						<div class="ecard-title">{event.title}</div>
						<div class="ecard-meta">
							<span>📅 {formatDate(event.event_at)}</span>
							<span>📍 {event.location}</span>
						</div>
						<div class="capacity-row">
							<div class="capacity-bar">
								<div
									style="width:{Math.min(
										100,
										Math.round((event.enrolled_count / event.capacity) * 100)
									)}%"
								></div>
							</div>
							<span class="capacity-txt">{event.enrolled_count}/{event.capacity}</span>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
