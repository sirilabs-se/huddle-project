import { requireUser } from '$lib/server/require-user';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// postgrest-js can't infer embedded-relation cardinality without generated
// DB types, so it types category/organizer as arrays even though the
// category_id/organizer_id foreign keys make them one-to-one at runtime.
export type EventDetail = {
	id: string;
	title: string;
	description: string;
	event_at: string;
	location: string;
	capacity: number;
	enrolled_count: number;
	organizer_id: string;
	category: { name: string } | null;
	organizer: { name: string } | null;
};

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = await requireUser(locals);

	const { data: rawEvent, error: dbError } = await locals.supabase
		.from('events')
		.select(
			'id, title, description, event_at, location, capacity, enrolled_count, organizer_id, category:categories(name), organizer:profiles(name)'
		)
		.eq('id', params.id)
		.single();

	if (dbError || !rawEvent) {
		error(404, 'Event not found');
	}

	const event = rawEvent as unknown as EventDetail;

	const { data: enrollment } = await locals.supabase
		.from('enrollments')
		.select('id')
		.eq('event_id', params.id)
		.eq('user_id', user.id)
		.maybeSingle();

	try {
		await locals.supabase.from('activity_log').insert({
			user_id: user.id,
			event_type: 'event_viewed',
			metadata: { event_id: event.id }
		});
	} catch {
		// best-effort: instrumentation must never block a successful lookup
	}

	return { event, isEnrolled: enrollment !== null, isOrganizer: event.organizer_id === user.id };
};

export const actions: Actions = {
	join: async ({ locals, params }) => {
		const user = await requireUser(locals);

		try {
			await locals.supabase.from('activity_log').insert({
				user_id: user.id,
				event_type: 'join_clicked',
				metadata: { event_id: params.id }
			});
		} catch {
			// best-effort
		}

		const { error: joinError } = await locals.supabase
			.from('enrollments')
			.insert({ event_id: params.id, user_id: user.id });

		if (joinError) {
			if (joinError.code === '23505') {
				return fail(400, { error: "You've already joined this event." });
			}
			if (joinError.code === 'EVCAP') {
				return fail(400, { error: 'This event just filled up.' });
			}
			return fail(400, { error: 'Unable to join this event. Please try again.' });
		}

		try {
			await locals.supabase.from('activity_log').insert({
				user_id: user.id,
				event_type: 'join_succeeded',
				metadata: { event_id: params.id }
			});
		} catch {
			// best-effort
		}

		return { joined: true };
	}
};
