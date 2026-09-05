import { requireUser } from '$lib/server/require-user';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// postgrest-js can't infer embedded-relation cardinality without generated
// DB types, so it types category/organizer as arrays even though the
// category_id/organizer_id foreign keys make them one-to-one at runtime.
export type EventListItem = {
	id: string;
	title: string;
	event_at: string;
	location: string;
	capacity: number;
	enrolled_count: number;
	category: { name: string } | null;
	organizer: { name: string } | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	await requireUser(locals);

	const { data: events, error: dbError } = await locals.supabase
		.from('events')
		.select(
			'id, title, event_at, location, capacity, enrolled_count, category:categories(name), organizer:profiles(name)'
		)
		.order('created_at', { ascending: false });

	if (dbError) {
		error(500, 'Failed to load events.');
	}

	return { events: (events ?? []) as unknown as EventListItem[] };
};
