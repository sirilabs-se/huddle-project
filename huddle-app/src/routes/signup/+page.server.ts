import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Supabase's own email validation doesn't require a TLD (e.g. "user@gmail"
// passes it), so this app enforces a stricter check itself rather than
// relying on Supabase Auth to catch malformed addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (session) {
		redirect(303, '/');
	}
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		const email = formData.get('email')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		if (name.length === 0 || name.length > 100) {
			return fail(400, { error: 'Please enter your name.', name, email });
		}
		if (email.length === 0 || !EMAIL_PATTERN.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.', name, email });
		}
		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.', name, email });
		}

		const { error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: { data: { name } }
		});

		if (error) {
			return fail(400, {
				error: 'Unable to create an account with those details.',
				name,
				email
			});
		}

		redirect(303, '/');
	}
};
