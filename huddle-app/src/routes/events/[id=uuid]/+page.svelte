<script lang="ts">
	let { data, form } = $props();

	let event = $derived(data.event);
	let isFull = $derived(event.enrolled_count >= event.capacity);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="section-pad" style="max-width:640px;margin:0 auto;">
	<div class="chip">{event.category?.name ?? 'Uncategorized'}</div>
	<h2 class="pg-title" style="margin-top:12px;">{event.title}</h2>
	<p class="pg-sub">
		Organized by {event.organizer?.name ?? 'Unknown'}
	</p>

	<div class="card" style="padding:16px;margin-bottom:20px;">
		<p style="margin:0 0 8px;">📅 {formatDate(event.event_at)}</p>
		<p style="margin:0 0 14px;">📍 {event.location}</p>
		<div class="capacity-row">
			<div class="capacity-bar">
				<div
					style="width:{Math.min(100, Math.round((event.enrolled_count / event.capacity) * 100))}%"
				></div>
			</div>
			<span class="capacity-txt">{event.enrolled_count}/{event.capacity}</span>
		</div>
	</div>

	<p style="white-space:pre-wrap;margin-bottom:24px;">{event.description}</p>

	{#if form?.error}
		<p class="form-error" role="alert">{form.error}</p>
	{/if}

	{#if data.isOrganizer}
		<p class="hint">You created this event.</p>
	{:else if data.isEnrolled}
		<button class="btn btn-primary" disabled>You're in ✓</button>
	{:else if isFull}
		<button class="btn btn-primary" disabled>Event Full</button>
	{:else}
		<form method="POST" action="?/join">
			<button type="submit" class="btn btn-primary">Join Event</button>
		</form>
	{/if}
</div>
