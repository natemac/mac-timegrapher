/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    A minimal RIFF/WAVE reader for the test harness. It reads what the browser
    recorder writes (32-bit IEEE float) and the 16-bit integer PCM that most
    other tools produce, so a fixture from either source can be compared.

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

#include "tg_wav.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define FORMAT_PCM        1
#define FORMAT_IEEE_FLOAT 3

static uint32_t rd_u32(const unsigned char *p) {
	return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static uint16_t rd_u16(const unsigned char *p) {
	return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

int tg_wav_read(const char *path, struct tg_wav *out, char *err, size_t errlen)
{
#define FAIL(...) do { snprintf(err, errlen, __VA_ARGS__); goto fail; } while(0)

	unsigned char *buf = NULL;
	out->samples = NULL;

	FILE *f = fopen(path, "rb");
	if(!f) { snprintf(err, errlen, "cannot open %s", path); return 0; }

	if(fseek(f, 0, SEEK_END) != 0) FAIL("cannot seek %s", path);
	long size = ftell(f);
	if(size < 12) FAIL("%s is too short to be a WAVE file", path);
	rewind(f);

	buf = malloc((size_t)size);
	if(!buf) FAIL("out of memory reading %s", path);
	if(fread(buf, 1, (size_t)size, f) != (size_t)size) FAIL("short read on %s", path);
	fclose(f);
	f = NULL;

	if(memcmp(buf, "RIFF", 4) || memcmp(buf + 8, "WAVE", 4))
		FAIL("%s is not a RIFF/WAVE file", path);

	uint16_t format = 0, channels = 0, bits = 0;
	uint32_t rate = 0;
	const unsigned char *data = NULL;
	uint32_t data_bytes = 0;

	/* Walk chunks rather than assuming offsets: a float WAV carries a fact
	   chunk between fmt and data, and some writers add others. */
	long o = 12;
	while(o + 8 <= size) {
		const unsigned char *id = buf + o;
		uint32_t csize = rd_u32(buf + o + 4);
		long body = o + 8;
		if(body + (long)csize > size) csize = (uint32_t)(size - body);

		if(!memcmp(id, "fmt ", 4) && csize >= 16) {
			format   = rd_u16(buf + body);
			channels = rd_u16(buf + body + 2);
			rate     = rd_u32(buf + body + 4);
			bits     = rd_u16(buf + body + 14);
		} else if(!memcmp(id, "data", 4)) {
			data = buf + body;
			data_bytes = csize;
		}
		o = body + csize + (csize % 2); /* chunks are word-aligned */
	}

	if(!data)                FAIL("%s has no data chunk", path);
	if(channels < 1)         FAIL("%s declares %u channels", path, channels);
	if(rate == 0)            FAIL("%s declares a zero sample rate", path);

	uint32_t frames, bytes_per_sample;
	if(format == FORMAT_IEEE_FLOAT && bits == 32) {
		bytes_per_sample = 4;
	} else if(format == FORMAT_PCM && bits == 16) {
		bytes_per_sample = 2;
	} else {
		FAIL("%s is format %u at %u-bit; expected 32-bit float or 16-bit PCM",
		     path, format, bits);
	}

	frames = data_bytes / (bytes_per_sample * channels);
	if(frames == 0) FAIL("%s contains no audio", path);

	out->samples = malloc((size_t)frames * sizeof(float));
	if(!out->samples) FAIL("out of memory for %u frames", frames);

	/* Downmix to mono by averaging: the timegrapher wants one signal, and a
	   stereo contact microphone usually carries the same signal twice. */
	for(uint32_t i = 0; i < frames; i++) {
		double acc = 0;
		for(uint16_t c = 0; c < channels; c++) {
			const unsigned char *p = data + ((size_t)i * channels + c) * bytes_per_sample;
			if(bytes_per_sample == 4) {
				float v;
				memcpy(&v, p, 4);
				acc += v;
			} else {
				acc += (int16_t)rd_u16(p) / 32768.0;
			}
		}
		out->samples[i] = (float)(acc / channels);
	}

	out->frame_count  = frames;
	out->sample_rate  = (int)rate;
	out->channel_count = channels;
	out->source_bits  = bits;
	out->source_float = (format == FORMAT_IEEE_FLOAT);

	free(buf);
	return 1;

fail:
	if(f) fclose(f);
	free(buf);
	free(out->samples);
	out->samples = NULL;
	return 0;
#undef FAIL
}

void tg_wav_free(struct tg_wav *w)
{
	if(!w) return;
	free(w->samples);
	w->samples = NULL;
	w->frame_count = 0;
}
