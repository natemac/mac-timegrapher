/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    WebAssembly bindings for the DSP core. Deliberately thin: it exposes the
    same tg_* API the command-line harness uses, so the browser and the
    reference tool exercise identical code. Anything that looks like logic
    belongs in core/, not here.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along
    with this program; if not, write to the Free Software Foundation, Inc.,
    51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
*/

#include "../core/tg_core.h"
#include <emscripten.h>

/*
   The result is returned through a caller-owned block of six doubles rather
   than by value. Emscripten can return a struct, but reading one out of the
   heap from JavaScript means hard-coding field offsets, which silently breaks
   the day someone reorders tg_result. Six named writes are harder to get
   wrong.
*/
enum {
	R_RATE = 0,
	R_AMPLITUDE,
	R_BEAT_ERROR,
	R_DETECTED_BPH,
	R_SIGNAL_QUALITY,
	R_VALID,
	R_FIELDS
};

EMSCRIPTEN_KEEPALIVE
int tgw_result_fields(void)
{
	return R_FIELDS;
}

EMSCRIPTEN_KEEPALIVE
tg_handle tgw_init(int sample_rate, int bph, double lift_angle)
{
	tg_config config;
	config.sample_rate = sample_rate;
	config.bph = bph;
	config.lift_angle = lift_angle;
	return tg_init(config);
}

EMSCRIPTEN_KEEPALIVE
void tgw_push(tg_handle h, const float *samples, int count)
{
	tg_push_samples(h, samples, count);
}

EMSCRIPTEN_KEEPALIVE
void tgw_result(tg_handle h, double *out)
{
	if(!out) return;

	tg_result r = tg_get_result(h);
	out[R_RATE]           = r.rate;
	out[R_AMPLITUDE]      = r.amplitude;
	out[R_BEAT_ERROR]     = r.beat_error;
	out[R_DETECTED_BPH]   = r.detected_bph;
	out[R_SIGNAL_QUALITY] = r.signal_quality;
	out[R_VALID]          = r.valid;
}

EMSCRIPTEN_KEEPALIVE
int tgw_events(tg_handle h, double *out_time, unsigned char *out_tictoc, int max)
{
	return tg_get_events(h, out_time, out_tictoc, max);
}

EMSCRIPTEN_KEEPALIVE
void tgw_reset(tg_handle h)
{
	tg_reset(h);
}

EMSCRIPTEN_KEEPALIVE
void tgw_destroy(tg_handle h)
{
	tg_destroy(h);
}

EMSCRIPTEN_KEEPALIVE
const char *tgw_version(void)
{
	return tg_version();
}
