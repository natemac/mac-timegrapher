/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

#ifndef TG_WAV_H
#define TG_WAV_H

#include <stdint.h>
#include <stddef.h>

struct tg_wav {
	float   *samples;       /* mono, [-1, 1] */
	uint32_t frame_count;
	int      sample_rate;
	int      channel_count; /* as found in the file, before downmix */
	int      source_bits;
	int      source_float;
};

/* Returns 1 on success, 0 on failure with a message in err. */
int  tg_wav_read(const char *path, struct tg_wav *out, char *err, size_t errlen);
void tg_wav_free(struct tg_wav *w);

#endif /* TG_WAV_H */
