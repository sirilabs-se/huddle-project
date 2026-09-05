import type { ParamMatcher } from '@sveltejs/kit';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const match: ParamMatcher = (param) => UUID_PATTERN.test(param);
