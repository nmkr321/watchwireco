# Photo source trace (2026-11-24)

**Question:** where did the big watch pages get the photos in 17 sample posts, so we know who to buy licences from or ask for permission?

**How it was done:** each photo was looked at by eye (who, where, what backdrop). Then news coverage of the same event was searched for printed photo credits. Reverse-image sites (TinEye, Google Lens) were blocked by human checks, so no exact pixel match was possible.

**What the confidence words mean:**
- **confirmed**: the credit is printed on the post, or the same image was found with a credit.
- **likely**: same event, and we know which agency covered it, but the exact image wasn't matched.
- **unknown**: nothing solid was found.

**Main finding:** only 7 of the 17 posts use celebrity photos. Not one of those 7 credits the photographer, and wristcheck even writes "*Photos not ours*". The other 10 use brand press images, auction-house images, or photos the account shot itself.

| # | account | person / scene | original source (with URL) | credit as printed | confidence |
|---|---|---|---|---|---|
| 1 | wristcheck | Harry Kane on stage with the Ballon d'Or trophy; Lamine Yamal on the red carpet (DAZN/Alipay/Hankook backdrop), Ballon d'Or, London Palladium, 26 Oct 2026 | Agency pool at the ceremony. AFP via Getty (Franck Fife, Toby Shepheard), AP (Kin Cheung), EPA and Bestimage were all shooting. See [The National](https://www.thenationalnews.com/sport/football/2026/10/27/ballon-dor-2026-harry-kane-beats-kylian-mbappe-and-lamine-yamal-to-claim-top-prize/) (AFP), [SI](https://www.si.com/soccer/harry-kane-25-year-win-2026-men-ballon-dor) (AFP/Getty), [Irish News](https://www.irishnews.com/sport/soccer/harry-kane-wins-2026-mens-ballon-dor-ahead-of-kylian-mbappe-and-lamine-yamal-PCAKTMUKTZICDBL2QORRVEO42A/) (AP) | none ("Photos not ours") | likely (Getty/AFP or AP) |
| 2 | nauvetimepieces | Messi with Di María in a dressing room (Argentina tracksuit); Messi and Antonela on a sofa | Phone-style snapshots. They look like the players' own Instagram posts or the Argentina team's (AFA) social accounts. No agency version found | none | unknown |
| 3 | nauvetimepieces | John Mayer: guitar with headphones; posing at a SiriusXM backdrop; outdoor gig in sunglasses | SiriusXM events are normally shot by Getty Images "for SiriusXM". Mayer's 2026 SiriusXM show is on [SiriusXM's press release](https://investor.siriusxm.com/news-events/press-releases/detail/2286/john-mayer-to-perform-exclusive-siriusxm-concert-in-the). The gig and guitar shots weren't matched | none | likely (Getty) for backdrop shot; others unknown |
| 4 | wristcheck | No celebrity. Bracelet graphics made from brand product photos (AP, Patek, Rolex, Vacheron, etc.) | Brand press-kit product images | none | likely (brand press images) |
| 5 | bigmoewatches | Ryan Reynolds: cover is a collage; an indoor interview frame; a balcony selfie-style photo | Interview frame looks like a video still; the balcony shot looks like his own social post. Nothing matched | none | unknown |
| 6 | bigmoewatches | Travis Scott: courtside at an NBA game (red seats, puffer jacket, mask); at a card table in a cap; collage cover | Courtside NBA shots usually come from Getty Images / NBAE. The card-table shot wasn't matched. Background: [GQ via Yahoo](https://ca.style.yahoo.com/travis-scott-wore-stunning-one-140000433.html) on the one-off Royal Oak | none | likely (Getty/NBAE) for courtside; rest unknown |
| 7 | watchproacademy | Yan Diomande hugging an official, and walking through Abidjan airport (white vest), arriving at Ivory Coast camp, 9 Nov 2026 | Arrival photos like this are put out by the Ivorian football federation (FIF) media team. Reports of the arrival credit "Photo: FIF" ([dailysports.net](https://dailysports.net/news/afcon-2027-qualifiers-yan-diomande-and-four-other-players-join-the-elephants-training-camp-in-abidjan/)) | none | likely (FIF) |
| 8 | watchproacademy | No celebrity. GPHG 2026 winning watches (Rexhep Rexhepi, Daniel Roth, Cleguer…) | GPHG official press images and brand press kits (gphg.org) | none | likely (GPHG/brand press) |
| 9 | bobswatches | No celebrity. Two Rolex Daytonas (1972 and 2024) | Bob's Watches' own studio photos of its stock | none needed (own) | likely (own photography) |
| 10 | watchanish | No celebrity. Comic-book illustrations of Anish with Vacheron Constantin dials | Watchanish's own artwork for a Vacheron campaign | none | likely (own artwork) |
| 11 | bobswatches | No celebrity. Rolex Submariner 6538 close-ups | Bob's Watches' own studio photos | none needed (own) | likely (own photography) |
| 12 | bigmoeinc | No celebrity. Most expensive F.P. Journe watches | Auction-house lot photos (Phillips, Christie's, etc.) | none | likely (auction houses) |
| 13 | bigmoeinc | No celebrity. Rolex x Caran d'Ache pen set | Unknown; probably a collector's or dealer's photo | none | unknown |
| 14 | crownandcaliber | No celebrity. Hublot Big Bang Unico at Phish / Sphere, Las Vegas | Credits printed in the caption | "Photo: Alexandra Cheney", "Photo: Hublot", "Photo: Jay Byrd", "Fontainebleau Las Vegas Urs Fischer Gallery/Mark Media" | confirmed |
| 15 | crownandcaliber | No celebrity. Werner Bronkhorst painting for IWC | The artist's own photos | "Photo: Werner Bronkhorst" | confirmed |
| 16 | luxurywatchmedia | Michael Schumacher (archive portrait in Ferrari kit) and his five F.P. Journe watches, Christie's Geneva, 9 Nov 2026 | Watch photos from Christie's. The portrait isn't credited; it's probably an old Getty or Ferrari archive photo | "Images: Christie's Images Limited 2026" | confirmed (watch photos); portrait unknown |
| 17 | luxurywatchmedia | No celebrity. Rotoris x Shantnu Nikhil watch | Rotoris press images (brand tagged in caption) | brand tagged, no photo credit | likely (brand press) |

**Totals:** 3 confirmed, 11 likely, 3 unknown.

## Who to contact (ranked by how many of the 17 posts they cover)

1. **Brand press offices: 4 posts (#4, #8, #14, #17)**
   - **What they offer:** free press images for editorial use with a credit line. You usually sign up to the brand's media/press room.
   - **Where:** GPHG press area at https://www.gphg.org, Hublot at https://www.hublot.com (press/media contact), and Rotoris at https://rotoris.world.
   - **Note:** easiest win. Ask each brand you cover for press-room access and log it in `permissions.json`.
2. **Getty Images (including AFP via Getty, Getty-for-SiriusXM and NBAE): 3 posts (#1, #3, #6), maybe #16's portrait too**
   - **What they sell:** editorial licences per image, and they offer social-media/digital editorial licensing for business accounts.
   - **Where:** https://www.gettyimages.com/company/contact-us
   - **Note:** the red-carpet, award-show and courtside shots almost all come from here. AP (https://www.apimages.com) also covered the Ballon d'Or and sells similar licences.
3. **Celebrities' or teams' own channels (management, federation press office): 3 posts (#2, #5, #7)**
   - **What they give:** permission only. There is no shop.
   - **Who:** for #7, email the FIF (Ivorian federation) press office via https://www.fif.ci. For Messi, try AFA press at https://www.afa.com.ar. For Reynolds, his management.
   - **Note:** expect slow or no answers.
4. **Auction houses: 2 posts (#12, #16)**
   - **What they offer:** lot photos for editorial use, usually free with the exact credit (e.g. "Christie's Images Limited 2026").
   - **Where:** Christie's press office at https://press.christies.com and Phillips at https://www.phillips.com/press.
   - **Note:** very reliable source for auction news posts.
5. **Independent artists and photographers: 2 posts (#14 partly, #15)**
   - **Who:** Werner Bronkhorst (https://wernerbronkhorst.com) and the Crown & Caliber writers' own photographers.
   - **How:** ask them directly, case by case.
6. **Own photography or artwork (nobody to contact): 3 posts (#9, #10, #11)**
   - **Note:** dealers and creators shoot their own. This is the safest model long term.
7. **Unknown: 1 post (#13).**

**Bottom line:** none of the big accounts credit their celebrity photos, so copying their habit is a risk, not a licence. For celebrity shots the realistic paid route is a Getty (or AP) editorial licence. For everything else, brand and auction-house press rooms are free with a credit.
