import { redirect } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';

export async function requireUser(locals: App.Locals): Promise<User> {
	const { user } = await locals.safeGetSession();
	if (!user) {
		redirect(303, '/login');
	}
	return user;
}
