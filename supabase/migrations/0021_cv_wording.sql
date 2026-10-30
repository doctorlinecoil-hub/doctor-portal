-- The doctor no longer operates: past tense in his CV (shown on the site and in opinions)
update public.settings set
  lh_cv = replace(replace(lh_cv,
    'ניסיוני הקליני כולל מאות ניתוחי מוח וחוט שדרה, שאני מבצע בשגרה.',
    'ניסיוני הקליני כלל מאות ניתוחי מוח וחוט שדרה, אותם ביצעתי בשגרה.'),
    'שאני מבצע בשגרה', 'אותם ביצעתי בשגרה'),
  lh_footer = replace(lh_footer, 'שאני מבצע בשגרה', 'אותם ביצעתי בשגרה'),
  lh_titles = replace(lh_titles, 'שאני מבצע בשגרה', 'אותם ביצעתי בשגרה')
where id = 1;
