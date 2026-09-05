import { requireUser } from '$lib/server/require-user';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Matches an ISO-8601 UTC timestamp ending in Z, with optional fractional
// seconds of any length. Independent of the client's toISOString() output —
// the property that matters is an unambiguous UTC offset, not byte-for-byte
// precision.
const EVENT_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export const load: PageServerLoad = async ({ locals }) => {
	await requireUser(locals);

	const { data: categories } = await locals.supabase
		.from('categories')
		.select('id, name')
		.order('sort_order', { ascending: true });

	return { categories: categories ?? [] };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = await requireUser(locals);

		const formData = await request.formData();
		const title = formData.get('title')?.toString().trim() ?? '';
		const description = formData.get('description')?.toString().trim() ?? '';
		const categoryId = formData.get('category_id')?.toString() ?? '';
		const eventAt = formData.get('event_at')?.toString() ?? '';
		const location = formData.get('location')?.toString().trim() ?? '';
		const capacityRaw = formData.get('capacity')?.toString() ?? '';

		const values = { title, description, categoryId, eventAt, location, capacityRaw };

		if (title.length === 0 || title.length > 120) {
			return fail(400, { error: 'Title is required (max 120 characters).', ...values });
		}
		if (description.length < 20 || description.length > 2000) {
			return fail(400, {
				error: 'Description must be between 20 and 2000 characters.',
				...values
			});
		}

		const { data: categories } = await locals.supabase.from('categories').select('id');
		const validCategoryIds = new Set((categories ?? []).map((c) => c.id));
		if (!validCategoryIds.has(categoryId)) {
			return fail(400, { error: 'Please select a category.', ...values });
		}

		if (!EVENT_AT_PATTERN.test(eventAt)) {
			return fail(400, { error: 'Please choose a valid date and time.', ...values });
		}
		if (new Date(eventAt).getTime() <= Date.now()) {
			return fail(400, { error: 'Date and time must be in the future.', ...values });
		}

		if (location.length === 0 || location.length > 200) {
			return fail(400, { error: 'Location is required (max 200 characters).', ...values });
		}

		const capacity = Number(capacityRaw);
		if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
			return fail(400, { error: 'Capacity must be a whole number between 1 and 500.', ...values });
		}

		const { data: event, error: insertError } = await locals.supabase
			.from('events')
			.insert({
				organizer_id: user.id,
				category_id: categoryId,
				title,
				description,
				event_at: eventAt,
				location,
				capacity
			})
			.select('id')
			.single();

		if (insertError || !event) {
			return fail(400, { error: 'Unable to create the event. Please try again.', ...values });
		}

		try {
			await locals.supabase.from('activity_log').insert({
				user_id: user.id,
				event_type: 'event_created',
				metadata: { event_id: event.id }
			});
		} catch {
			// best-effort: instrumentation must never block a successful create
		}

		redirect(303, `/events/${event.id}`);
	}
};
