<script lang="ts">
	import { resolve } from '$app/paths';

	let { form } = $props();
</script>

<div class="auth-wrap">
	<div class="auth-card">
		<h1>Create your account</h1>
		<p class="sub">Find your people. Join what moves you.</p>

		{#if form?.error}
			<p class="form-error">{form.error}</p>
		{/if}

		<form method="POST">
			<div class="field">
				<label for="name">Full name</label>
				<input
					id="name"
					type="text"
					name="name"
					autocomplete="name"
					required
					value={form?.name ?? ''}
				/>
			</div>
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
					autocomplete="new-password"
					minlength="8"
					required
				/>
				<p class="hint">Use 8+ characters.</p>
			</div>
			<button type="submit" class="btn btn-primary btn-block">Create account</button>
		</form>

		<p class="mt-4 text-center text-sm text-[var(--color-text-muted)]">
			Already have an account?
			<a href={resolve('/login')} class="font-semibold text-[var(--color-text)] hover:underline"
				>Log in</a
			>
		</p>
	</div>
</div>
