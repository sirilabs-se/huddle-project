<script lang="ts">
	import { resolve } from '$app/paths';

	let { form } = $props();
</script>

<div class="auth-wrap">
	<div class="auth-card">
		<h1>Welcome back</h1>
		<p class="sub">Log in to see what's happening.</p>

		{#if form?.error}
			<p class="form-error">{form.error}</p>
		{/if}

		<form method="POST">
			<div class="field">
				<label for="email">Email</label>
				<input
					id="email"
					type="email"
					name="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
				/>
			</div>
			<div class="field">
				<label for="password">Password</label>
				<input
					id="password"
					type="password"
					name="password"
					autocomplete="current-password"
					required
				/>
			</div>
			<button type="submit" class="btn btn-primary btn-block">Log in</button>
		</form>

		<p class="mt-4 text-center text-sm text-[var(--color-text-muted)]">
			New here?
			<a href={resolve('/signup')} class="font-semibold text-[var(--color-text)] hover:underline"
				>Sign up</a
			>
		</p>
	</div>
</div>
