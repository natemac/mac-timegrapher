/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { GUIDE } from '../guide-content';

/*
   The guide, as one collapsed list.

   Every section is closed on arrival. Seventeen topics opened at once is a wall
   of prose nobody reads; closed, it is a contents page that answers the one
   question that was actually asked.
*/
export function GuidePanel() {
  return (
    <section role="tabpanel" id="panel-guide" aria-labelledby="tab-guide">
      {GUIDE.map((topic) => (
        <details key={topic.id}>
          <summary>{topic.summary}</summary>
          {topic.body}
        </details>
      ))}
    </section>
  );
}
