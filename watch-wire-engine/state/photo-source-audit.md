# Where top watch pages get their celebrity photos (audit, 22 Nov 2026)

Checked 148 celebrity posts from 10 accounts (nauvetimepieces, wristcheck, bigmoewatches, bigmoeinc,
watchproacademy, luxurywatchmedia, swisswatchgang, watchanish, crownandcaliber, bobswatches) through the
official API, and looked at the photos of the 6 best-performing ones.

## What the photos are
1. **The celebrity's own Instagram** (most common for candid shots). Messi with Di María / Antonela (nauvetimepieces),
   Ryan Reynolds at home and in his ads (bigmoewatches), Yan Diomande at the airport (watchproacademy), Travis Scott selfies.
   Rights belong to the photographer / the celebrity's team.
2. **Event and sports agency photos** for red carpets, award nights and courtside: Ballon d'Or (wristcheck, Harry Kane),
   Travis Scott courtside, Oscars. Usually **Getty Images**, AFP, Reuters, NBAE (NBA), WireImage. nauvetimepieces even credits "📷: Getty Images".
3. **Watch photos**: the brand's own product images and auction houses (Christie's, Phillips) or dealers. We already use these (official).
4. **Other watch-spotting accounts**: credited handles @mon.petit.horloger and @lvtrraw.

## How they credit
- Most credit nothing: 36 of 49 nauvetimepieces celebrity posts, 6 of 10 wristcheck posts.
- wristcheck writes "Photos not ours". luxurywatchmedia credits Christie's, GPHG and Rolex. crownandcaliber credits the artist.

## Who to ask for permission (in order of usefulness)
1. **Getty Images** (and its WireImage): covers most red carpets, award nights and sports. They sell licences for social media use.
2. **Celebrity / team accounts** for candid shots: the celebrity's management or the club/brand that posted it.
3. **Watch-spotting accounts** that shoot or collect wrist shots: @mon.petit.horloger, @lvtrraw, and photographers credited in captions.
4. **Sports leagues and teams** (NBA/NBAE, football clubs) for courtside and tunnel photos.
5. Other agencies often used for celebrity candids: Backgrid, Splash News, MEGA Agency, GC Images.

When you have a permission, add it to `state/permissions.json` (or tell Claude): who, what it covers, the exact credit line,
the date, and where the proof is. The engine then uses that source's photos.
