"""
The seventeen tile icons the supplied pack did not cover.

Drawn to the shape the existing twenty-four already have, measured off them
rather than guessed: 175x175 RGB on white, a rounded square 163 across with a
36-point radius, a vertical gradient from a lighter top to a darker bottom, and
one white glyph in the middle.

The glyph is built as a MASK rather than painted white directly. A detail
inside a white shape - the hole in a price tag, the lines on a bill - has to be
an absence of glyph, not more white on white, and the first version of this
file got that wrong on nine of the seventeen.

Drawn at 6x and reduced, because an aliased edge is the one thing that would
give these away beside the supplied ones.
"""
import math
from PIL import Image, ImageDraw

SIZE = 175
S = 6
BOX = 163
RADIUS = 36
INSET = (SIZE - BOX) // 2
WHITE = (255, 255, 255)

ON, OFF = 255, 0

BLUE   = ((24, 156, 254), (1, 72, 197))
GREEN  = ((26, 194, 122), (1, 118, 114))
PURPLE = ((166, 72, 251), (73, 30, 197))
TEAL   = ((26, 193, 170), (2, 115, 125))
AMBER  = ((255, 176, 46), (226, 108, 10))
RED    = ((250, 92, 92), (201, 32, 60))
INDIGO = ((124, 140, 255), (62, 52, 196))
PINK   = ((244, 94, 196), (176, 26, 148))
SLATE  = ((96, 120, 150), (36, 52, 82))


def plate(top, bottom):
    w = SIZE * S
    img = Image.new('RGB', (w, w), WHITE)
    grad = Image.new('RGB', (1, w))
    gd = grad.load()
    for y in range(w):
        t = y / (w - 1)
        gd[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    mask = Image.new('L', (w, w), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [INSET * S, INSET * S, (INSET + BOX) * S - 1, (INSET + BOX) * S - 1],
        radius=RADIUS * S, fill=255)
    img.paste(grad.resize((w, w)), (0, 0), mask)
    return img


class Pen:
    """Draws the glyph into a mask, in 0-100 co-ordinates over the glyph area."""

    def __init__(self):
        w = SIZE * S
        self.mask = Image.new('L', (w, w), OFF)
        self.d = ImageDraw.Draw(self.mask)
        self.span = BOX * 0.60 * S
        self.x0 = (INSET + BOX / 2) * S - self.span / 2
        self.y0 = (INSET + BOX / 2) * S - self.span / 2

    def p(self, x, y):
        return (self.x0 + self.span * x / 100.0, self.y0 + self.span * y / 100.0)

    def u(self, v):
        return self.span * v / 100.0

    def rect(self, x, y, w, h, r=0, v=ON):
        a, b = self.p(x, y); c, e = self.p(x + w, y + h)
        if r:
            self.d.rounded_rectangle([a, b, c, e], radius=self.u(r), fill=v)
        else:
            self.d.rectangle([a, b, c, e], fill=v)

    def circle(self, x, y, rad, v=ON):
        a, b = self.p(x, y); r = self.u(rad)
        self.d.ellipse([a - r, b - r, a + r, b + r], fill=v)

    def ring(self, x, y, rad, width, v=ON):
        a, b = self.p(x, y); r = self.u(rad)
        self.d.ellipse([a - r, b - r, a + r, b + r], outline=v, width=round(self.u(width)))

    def line(self, pts, width, v=ON):
        self.d.line([self.p(*q) for q in pts], fill=v, width=round(self.u(width)), joint='curve')

    def poly(self, pts, v=ON):
        self.d.polygon([self.p(*q) for q in pts], fill=v)

    def pie(self, x0, y0, x1, y1, start, end, v=ON):
        self.d.pieslice([self.p(x0, y0), self.p(x1, y1)], start, end, fill=v)

    def arc(self, x, y, rad, start, end, width, v=ON):
        a, b = self.p(x, y); r = self.u(rad)
        self.d.arc([a - r, b - r, a + r, b + r], start, end, fill=v, width=round(self.u(width)))

    def person(self, cx, cy, head, v=ON):
        """A head and shoulders, the shape every account-ish tile is built on."""
        self.circle(cx, cy, head, v)
        self.pie(cx - head * 1.9, cy + head * 0.55, cx + head * 1.9, cy + head * 3.6, 180, 360, v)


# --- glyphs ----------------------------------------------------------------

def salary(pen):              # a calculator, for what is owed and worked
    # Not another banknote: Top-Ups and Wallet Transfer are both notes already,
    # and three of them on one grid is three tiles nobody can tell apart. The
    # reference set uses a calculator for Salary/OT, which is also what the
    # screen behind this tile actually is.
    pen.rect(10, 0, 80, 100, r=12)
    pen.rect(22, 12, 56, 20, r=5, v=OFF)
    for row in range(3):
        for col in range(3):
            pen.rect(22 + col * 21, 44 + row * 18, 14, 11, r=3, v=OFF)


def myAccount(pen):           # a person on a card
    pen.rect(2, 14, 96, 72, r=12)
    pen.person(50, 40, 11, v=OFF)


def support(pen):             # a headset
    pen.arc(50, 56, 40, 180, 360, 11)
    pen.rect(4, 52, 24, 40, r=11)
    pen.rect(72, 52, 24, 40, r=11)


def reports(pen):             # bars, rising
    pen.rect(6, 56, 20, 38, r=5)
    pen.rect(40, 32, 20, 62, r=5)
    pen.rect(74, 10, 20, 84, r=5)


def inquiries(pen):           # a question asked
    pen.rect(2, 10, 96, 66, r=17)
    pen.poly([(24, 70), (24, 96), (52, 74)])
    for cx in (30, 50, 70):
        pen.circle(cx, 43, 7, v=OFF)


def kyc(pen):                 # an identity card, checked
    pen.rect(0, 16, 100, 68, r=12)
    pen.person(30, 42, 10, v=OFF)
    pen.rect(56, 38, 32, 8, r=4, v=OFF)
    pen.rect(56, 54, 22, 8, r=4, v=OFF)


def moreFeatures(pen):        # everything else
    for row in range(3):
        for col in range(3):
            pen.rect(6 + col * 33, 6 + row * 33, 24, 24, r=8)


def dealerFeatures(pen):      # a case of work
    pen.rect(32, 4, 36, 20, r=7)
    pen.rect(40, 12, 20, 14, r=3, v=OFF)
    pen.rect(0, 24, 100, 62, r=12)
    pen.rect(42, 48, 16, 14, r=4, v=OFF)


def resellerFeatures(pen):    # a price tag
    pen.poly([(6, 6), (56, 6), (96, 46), (52, 94), (6, 52)])
    pen.circle(28, 28, 9, v=OFF)


def history(pen):             # a clock
    pen.ring(50, 50, 42, 11)
    pen.line([(50, 24), (50, 52), (72, 64)], 9)


def topup(pen):               # a wallet, with more going into it
    pen.rect(0, 24, 100, 60, r=13)
    # Square corners on the plus. Rounded ones read as a medical cross, which
    # is a different tile on this very grid.
    pen.rect(44, 40, 12, 28, v=OFF)
    pen.rect(36, 48, 28, 12, v=OFF)


def invoices(pen):            # a bill
    pen.poly([(12, 0), (66, 0), (90, 24), (90, 98), (12, 98)])
    pen.poly([(66, 0), (90, 24), (66, 24)], v=OFF)
    pen.rect(26, 40, 48, 7, r=4, v=OFF)
    pen.rect(26, 56, 48, 7, r=4, v=OFF)
    pen.rect(26, 72, 28, 7, r=4, v=OFF)


def profile(pen):             # a badge on a lanyard
    pen.line([(50, 0), (50, 14)], 7)
    pen.rect(14, 12, 72, 84, r=13)
    pen.person(50, 42, 11, v=OFF)


def walletTransfer(pen):      # money, moving
    pen.rect(0, 18, 100, 64, r=13)
    pen.line([(26, 40), (70, 40)], 8, v=OFF)
    pen.poly([(64, 29), (82, 40), (64, 51)], v=OFF)
    pen.line([(74, 62), (30, 62)], 8, v=OFF)
    pen.poly([(36, 51), (18, 62), (36, 73)], v=OFF)


def myDocuments(pen):         # a folder of them
    pen.rect(20, 6, 46, 18, r=5)
    pen.poly([(0, 18), (36, 18), (46, 30), (100, 30), (100, 92), (0, 92)])


def documents(pen):           # a stack of pages
    pen.rect(6, 2, 60, 76, r=9)
    pen.rect(30, 20, 64, 78, r=9, v=OFF)
    pen.rect(34, 24, 56, 70, r=7)


def fomema(pen):              # a medical check
    # Replaces a supplied file that was byte-identical to visa.png and
    # verificationManagement.png - one passport image on three different tiles.
    pen.rect(14, 8, 72, 90, r=11)
    pen.rect(36, 0, 28, 16, r=5)
    pen.rect(44, 34, 12, 36, v=OFF)
    pen.rect(32, 46, 36, 12, v=OFF)


def verificationManagement(pen):  # a check that was done
    # Also a passport in the supplied pack. A shield rather than another card:
    # Profile & KYC already carries the card, and this is the staff screen that
    # decides on one.
    pen.poly([(50, 0), (96, 18), (96, 52), (50, 100), (4, 52), (4, 18)])
    pen.line([(30, 48), (44, 64), (72, 32)], 10, v=OFF)


def finance(pen):             # money, managed
    # The supplied file was byte-identical to ledger.png, and both were a
    # support headset.
    pen.circle(32, 36, 30)
    pen.circle(32, 36, 12, v=OFF)
    pen.rect(54, 54, 16, 44, r=4)
    pen.rect(76, 36, 16, 62, r=4)
    pen.rect(32, 72, 16, 26, r=4)


def ledger(pen):              # the book it is all written in
    pen.rect(6, 6, 88, 88, r=10)
    pen.rect(22, 6, 8, 88, v=OFF)
    for y in (26, 46, 66):
        pen.rect(40, y, 40, 8, r=4, v=OFF)


def internet(pen):            # a connection
    # The supplied file was byte-identical to remittance.png - one globe on
    # both tiles. Remittance keeps the globe; this is what internet is.
    for i, rad in enumerate((20, 42, 64)):
        pen.arc(50, 86, rad, 215, 325, 11)
    pen.circle(50, 84, 9)


def billpayment(pen):         # a bill, settled
    # One of three tiles the supplied pack gave the same wallet image.
    pen.poly([(14, 0), (86, 0), (86, 100), (74, 90), (62, 100), (50, 90),
              (38, 100), (26, 90), (14, 100)])
    pen.rect(28, 22, 44, 8, r=4, v=OFF)
    pen.rect(28, 40, 44, 8, r=4, v=OFF)
    pen.rect(28, 58, 26, 8, r=4, v=OFF)


def walletFunding(pen):       # money put in
    pen.rect(4, 44, 92, 54, r=11)
    pen.rect(34, 60, 32, 8, r=4, v=OFF)
    pen.line([(50, 0), (50, 30)], 10)
    pen.poly([(30, 20), (70, 20), (50, 42)])


def mydigital(pen):           # an arrival card
    pen.rect(2, 16, 96, 68, r=11)
    pen.rect(2, 28, 96, 10, v=OFF)
    # A paper plane rather than an airliner: at 52 points on a phone an
    # airliner silhouette turns to mush, and this does not.
    pen.poly([(22, 64), (82, 44), (50, 74)], v=OFF)
    pen.poly([(50, 74), (42, 66), (34, 69)], v=OFF)


def passport(pen):            # an appointment for one
    pen.rect(6, 10, 88, 88, r=10)
    pen.rect(6, 10, 88, 22, r=10, v=OFF)
    pen.rect(6, 24, 88, 8, v=OFF)
    pen.rect(24, 0, 12, 22, r=5)
    pen.rect(64, 0, 12, 22, r=5)
    pen.line([(32, 62), (46, 76), (70, 48)], 11, v=OFF)


def bus(pen):                 # a bus
    # The supplied bus.png was an identity card with a tick on it.
    pen.rect(8, 6, 84, 70, r=12)
    pen.rect(18, 20, 64, 24, r=5, v=OFF)
    pen.rect(46, 20, 8, 24, v=OFF)
    pen.circle(26, 60, 8, v=OFF)
    pen.circle(74, 60, 8, v=OFF)
    pen.rect(14, 78, 20, 16, r=6)
    pen.rect(66, 78, 20, 16, r=6)


def adminFeatures(pen):       # settings
    teeth = 8
    for i in range(teeth):
        ang = math.pi * 2 * i / teeth
        cx = 50 + 40 * math.cos(ang)
        cy = 50 + 40 * math.sin(ang)
        pen.rect(cx - 10, cy - 10, 20, 20, r=5)
    pen.circle(50, 50, 33)
    pen.circle(50, 50, 13, v=OFF)


def operations(pen):          # the day's running
    pen.rect(0, 10, 100, 14, r=7)
    pen.circle(72, 17, 13, v=OFF)
    pen.circle(72, 17, 6)
    pen.rect(0, 43, 100, 14, r=7)
    pen.circle(30, 50, 13, v=OFF)
    pen.circle(30, 50, 6)
    pen.rect(0, 76, 100, 14, r=7)
    pen.circle(62, 83, 13, v=OFF)
    pen.circle(62, 83, 6)


def system(pen):              # what the whole thing runs on
    for y in (2, 38, 74):
        pen.rect(2, y, 96, 24, r=7)
        pen.circle(18, y + 12, 5, v=OFF)
        pen.rect(56, y + 8, 30, 8, r=4, v=OFF)


def pending(pen):             # waiting
    pen.rect(14, 0, 72, 12, r=5)
    pen.rect(14, 88, 72, 12, r=5)
    pen.poly([(24, 12), (76, 12), (54, 50), (76, 88), (24, 88), (46, 50)])
    pen.poly([(38, 24), (62, 24), (50, 42)], v=OFF)


def rates(pen):               # one currency against another
    pen.arc(50, 50, 40, 150, 30, 11)
    pen.poly([(74, 2), (94, 18), (70, 30)])
    pen.arc(50, 50, 40, 330, 210, 11)
    pen.poly([(26, 98), (6, 82), (30, 70)])


def pricing(pen):             # what it costs
    pen.circle(50, 50, 48)
    pen.circle(32, 32, 11, v=OFF)
    pen.circle(68, 68, 11, v=OFF)
    pen.line([(26, 76), (74, 24)], 9, v=OFF)


def payments(pen):            # a card
    pen.rect(0, 16, 100, 68, r=11)
    pen.rect(0, 30, 100, 14, v=OFF)
    pen.rect(12, 60, 30, 10, r=5, v=OFF)


def featureAccess(pen):       # who may open what
    pen.rect(10, 42, 80, 58, r=12)
    pen.arc(50, 42, 26, 180, 360, 11)
    pen.circle(50, 66, 9, v=OFF)
    pen.rect(45, 66, 10, 18, r=4, v=OFF)


def gridManagement(pen):      # which tiles show
    pen.rect(2, 2, 44, 44, r=10)
    pen.rect(54, 2, 44, 44, r=10)
    pen.rect(2, 54, 44, 44, r=10)
    pen.rect(54, 54, 44, 44, r=10)
    pen.rect(62, 62, 28, 28, r=6, v=OFF)


def webviewManagement(pen):   # a page
    pen.rect(0, 10, 100, 80, r=11)
    pen.rect(0, 10, 100, 20, r=11, v=OFF)
    pen.rect(0, 24, 100, 8, v=OFF)
    for cx in (12, 26, 40):
        pen.circle(cx, 20, 5)


def banners(pen):             # a picture
    pen.rect(0, 14, 100, 72, r=11)
    pen.circle(28, 36, 9, v=OFF)
    pen.poly([(8, 78), (40, 44), (64, 78)], v=OFF)
    pen.poly([(52, 78), (74, 54), (94, 78)], v=OFF)


def announcements(pen):       # something said to everybody
    pen.poly([(8, 36), (44, 36), (84, 8), (84, 92), (44, 64), (8, 64)])
    pen.rect(16, 64, 22, 30, r=6)
    pen.arc(84, 50, 22, 300, 60, 9)


def apiManagement(pen):       # one system plugged into another
    pen.rect(30, 0, 12, 26, r=4)
    pen.rect(58, 0, 12, 26, r=4)
    pen.rect(16, 26, 68, 34, r=10)
    pen.rect(42, 60, 16, 24)
    pen.arc(50, 60, 26, 0, 180, 11)


def billElectricity(pen):     # a bolt
    pen.poly([(58, 0), (18, 56), (44, 56), (36, 100), (80, 40), (52, 40)])


def billWater(pen):           # a drop
    pen.poly([(50, 0), (84, 48), (16, 48)])
    pen.circle(50, 58, 34)


def billGas(pen):             # a cylinder
    # Not a flame: the flame drawn small enough to fit was a blob with a spike,
    # and at the size this renders it read as the water drop beside it.
    pen.rect(40, 0, 20, 16, r=4)
    pen.rect(32, 10, 36, 10, r=4)
    pen.rect(16, 18, 68, 82, r=16)
    pen.rect(28, 42, 44, 10, r=5, v=OFF)


def billInternet(pen):        # a connection
    for rad in (22, 46, 70):
        pen.arc(50, 90, rad, 215, 325, 12)
    pen.circle(50, 88, 10)


def billTv(pen):              # a screen
    pen.rect(2, 10, 96, 68, r=10)
    pen.rect(14, 22, 72, 44, r=4, v=OFF)
    pen.rect(42, 78, 16, 12)
    pen.rect(24, 90, 52, 10, r=5)


def billMobile(pen):          # a handset
    pen.rect(22, 0, 56, 100, r=12)
    pen.rect(30, 12, 40, 68, r=4, v=OFF)
    pen.circle(50, 90, 6, v=OFF)


def billUtilities(pen):       # everything else that arrives monthly
    for row in range(2):
        for col in range(2):
            pen.rect(6 + col * 50, 6 + row * 50, 38, 38, r=10)
    pen.rect(16, 16, 18, 18, r=5, v=OFF)
    pen.rect(66, 66, 18, 18, r=5, v=OFF)


# --- brand marks -----------------------------------------------------------
#
# A company's own logo, not a drawing of what the tile does. JomPAY is printed
# on the bill in somebody's hand and Touch 'n Go is on the card in their wallet,
# so the mark is the thing they are looking for - the same reason the bus
# operators keep theirs. Fitted to the plate rather than redrawn, so they sit in
# the grid at the same size and corner radius as everything else.
BRANDS = [
    ('jompay', 'assets/billers/jompay.png'),
    ('tngewallet', 'assets/billers/tngewallet-source.jpg'),
]


def brand(source):
    """The supplied mark, trimmed of its margin and fitted to the plate."""
    im = Image.open(source).convert('RGB')
    # Trim whatever white border the source came with, so two marks with
    # different margins still fill the same square.
    bbox = im.point(lambda v: 255 if v < 244 else 0).convert('L').getbbox()
    if bbox:
        im = im.crop(bbox)
    w = SIZE * S
    img = Image.new('RGB', (w, w), WHITE)
    mark = im.resize((BOX * S, BOX * S), Image.LANCZOS)
    mask = Image.new('L', (BOX * S, BOX * S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, BOX * S - 1, BOX * S - 1], radius=RADIUS * S, fill=255)
    img.paste(mark, (INSET * S, INSET * S), mask)
    return img


ICONS = [
    ('salary', GREEN, salary),
    ('myAccount', BLUE, myAccount),
    ('support', RED, support),
    ('reports', BLUE, reports),
    ('inquiries', INDIGO, inquiries),
    ('kyc', AMBER, kyc),
    ('moreFeaturesTile', PURPLE, moreFeatures),
    ('dealerFeatures', TEAL, dealerFeatures),
    ('resellerFeatures', PINK, resellerFeatures),
    ('history', BLUE, history),
    ('topup', GREEN, topup),
    ('invoices', AMBER, invoices),
    ('profile', PURPLE, profile),
    ('walletTransfer', TEAL, walletTransfer),
    ('myDocuments', AMBER, myDocuments),
    ('documents', SLATE, documents),
    ('adminFeatures', SLATE, adminFeatures),
    # Four the supplied pack shipped as duplicates of each other.
    ('fomema', RED, fomema),
    ('verificationManagement', BLUE, verificationManagement),
    ('finance', GREEN, finance),
    ('ledger', INDIGO, ledger),
    ('internet', BLUE, internet),
    ('billpayment', INDIGO, billpayment),
    ('walletFunding', TEAL, walletFunding),
    ('mydigital', PURPLE, mydigital),
    ('passport', RED, passport),
    ('bus', AMBER, bus),
    # The Bill Payment category picker, which drew one-colour vectors while
    # every grid around it had pictures.
    ('billElectricity', AMBER, billElectricity),
    ('billWater', BLUE, billWater),
    ('billGas', RED, billGas),
    ('billInternet', INDIGO, billInternet),
    ('billTv', PURPLE, billTv),
    ('billMobile', TEAL, billMobile),
    ('billUtilities', SLATE, billUtilities),
    # The superadmin hub, which was still all emoji.
    ('operations', BLUE, operations),
    ('system', SLATE, system),
    ('pending', AMBER, pending),
    ('rates', PURPLE, rates),
    ('pricing', AMBER, pricing),
    ('payments', BLUE, payments),
    ('featureAccess', PURPLE, featureAccess),
    ('gridManagement', TEAL, gridManagement),
    ('webviewManagement', GREEN, webviewManagement),
    ('banners', PINK, banners),
    ('announcements', RED, announcements),
    ('apiManagement', INDIGO, apiManagement),
]

if __name__ == '__main__':
    import sys
    out = sys.argv[1]
    import os
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    for name, palette, draw in ICONS:
        img = plate(*palette)
        pen = Pen()
        draw(pen)
        img.paste(Image.new('RGB', img.size, WHITE), (0, 0), pen.mask)
        img.resize((SIZE, SIZE), Image.LANCZOS).save(f'{out}/{name}.png')
    for name, source in BRANDS:
        brand(os.path.join(root, source)).resize((SIZE, SIZE), Image.LANCZOS).save(f'{out}/{name}.png')
    print(f'{len(ICONS)} drawn and {len(BRANDS)} brand marks written to {out}')
