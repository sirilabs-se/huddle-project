<script lang="ts">
	let { data, form } = $props();

	let localDateTime = $state('');
	// datetime-local has no offset, so "no offset" here correctly means the
	// browser's (organizer's) local timezone -- converting server-side would
	// use the server's timezone instead.
	let eventAtIso = $derived(localDateTime ? new Date(localDateTime).toISOString() : '');
</script>

<div class="section-pad" style="max-width:640px;margin:0 auto;">
	<h2 class="pg-title">Create a New Event</h2>
	<p class="pg-sub">Fill in the details below.</p>

	{#if form?.error}
		<p class="form-error" role="alert">{form.error}</p>
	{/if}

	<form method="POST">
		<div class="field">
			<label for="title">Event title</label>
			<input
				id="title"
				type="text"
				name="title"
				maxlength="120"
				required
				value={form?.title ?? ''}
				placeholder="e.g. Saturday Morning 5K Group Run"
			/>
		</div>

		<div class="field">
			<label for="description">Description</label>
			<textarea
				id="description"
				name="description"
				required
				placeholder="What's this event about? (20+ characters)">{form?.description ?? ''}</textarea
			>
		</div>

		<div class="field">
			<label for="category">Category</label>
			<select id="category" name="category_id" required value={form?.categoryId ?? ''}>
				<option value="" disabled selected={!form?.categoryId}>Select a category</option>
				{#each data.categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label for="datetime">Date &amp; time</label>
			<input id="datetime" type="datetime-local" bind:value={localDateTime} required />
			<input type="hidden" name="event_at" value={eventAtIso} />
			<p class="hint">Participants see this in their own local time zone.</p>
		</div>

		<div class="field">
			<label for="location">Location</label>
			<input
				id="location"
				type="text"
				name="location"
				maxlength="200"
				required
				value={form?.location ?? ''}
				placeholder="e.g. Riverside Park, North Entrance"
			/>
		</div>

		<div class="field">
			<label for="capacity">Capacity</label>
			<input
				id="capacity"
				type="number"
				name="capacity"
				min="1"
				max="500"
				required
				value={form?.capacityRaw ?? ''}
			/>
		</div>

		<button type="submit" class="btn btn-primary">Publish</button>
	</form>
</div>
