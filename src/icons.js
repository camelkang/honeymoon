import map from "lucide-static/dist/esm/icons/map.mjs";
import calendar from "lucide-static/dist/esm/icons/calendar-days.mjs";
import heart from "lucide-static/dist/esm/icons/heart.mjs";
import house from "lucide-static/dist/esm/icons/house.mjs";
import search from "lucide-static/dist/esm/icons/search.mjs";
import plus from "lucide-static/dist/esm/icons/plus.mjs";
import x from "lucide-static/dist/esm/icons/x.mjs";
import pin from "lucide-static/dist/esm/icons/map-pin.mjs";
import user from "lucide-static/dist/esm/icons/user.mjs";
import settings from "lucide-static/dist/esm/icons/settings.mjs";
import phone from "lucide-static/dist/esm/icons/smartphone.mjs";
import landmark from "lucide-static/dist/esm/icons/landmark.mjs";
import sunset from "lucide-static/dist/esm/icons/sunset.mjs";
import trees from "lucide-static/dist/esm/icons/trees.mjs";
import waves from "lucide-static/dist/esm/icons/waves-horizontal.mjs";
import utensils from "lucide-static/dist/esm/icons/utensils.mjs";
import coffee from "lucide-static/dist/esm/icons/coffee.mjs";
import martini from "lucide-static/dist/esm/icons/martini.mjs";
import bag from "lucide-static/dist/esm/icons/shopping-bag.mjs";
import bed from "lucide-static/dist/esm/icons/bed-double.mjs";
import tram from "lucide-static/dist/esm/icons/tram-front.mjs";
import star from "lucide-static/dist/esm/icons/star.mjs";
import sparkles from "lucide-static/dist/esm/icons/sparkles.mjs";
import chevronDown from "lucide-static/dist/esm/icons/chevron-down.mjs";
import up from "lucide-static/dist/esm/icons/arrow-up.mjs";
import down from "lucide-static/dist/esm/icons/arrow-down.mjs";
import swap from "lucide-static/dist/esm/icons/arrow-left-right.mjs";
import trash from "lucide-static/dist/esm/icons/trash.mjs";
import eye from "lucide-static/dist/esm/icons/eye.mjs";
import navigation from "lucide-static/dist/esm/icons/navigation.mjs";
import walk from "lucide-static/dist/esm/icons/footprints.mjs";
import train from "lucide-static/dist/esm/icons/train-front.mjs";
import car from "lucide-static/dist/esm/icons/car.mjs";
import clock from "lucide-static/dist/esm/icons/clock.mjs";
import upload from "lucide-static/dist/esm/icons/upload.mjs";
import download from "lucide-static/dist/esm/icons/download.mjs";
import reset from "lucide-static/dist/esm/icons/rotate-ccw.mjs";
import share from "lucide-static/dist/esm/icons/share-2.mjs";
import link from "lucide-static/dist/esm/icons/link.mjs";
import logout from "lucide-static/dist/esm/icons/log-out.mjs";
import check from "lucide-static/dist/esm/icons/check.mjs";
import info from "lucide-static/dist/esm/icons/info.mjs";
import external from "lucide-static/dist/esm/icons/external-link.mjs";
import calendarPlus from "lucide-static/dist/esm/icons/calendar-plus.mjs";
import sliders from "lucide-static/dist/esm/icons/sliders-horizontal.mjs";
import handshake from "lucide-static/dist/esm/icons/heart-handshake.mjs";
import plane from "lucide-static/dist/esm/icons/plane.mjs";
import globe from "lucide-static/dist/esm/icons/globe.mjs";
import camera from "lucide-static/dist/esm/icons/camera.mjs";
import listChecks from "lucide-static/dist/esm/icons/list-checks.mjs";
import wallet from "lucide-static/dist/esm/icons/wallet.mjs";
import receipt from "lucide-static/dist/esm/icons/receipt.mjs";
import square from "lucide-static/dist/esm/icons/square.mjs";
import checkSquare from "lucide-static/dist/esm/icons/square-check-big.mjs";
import users from "lucide-static/dist/esm/icons/users.mjs";
import ticket from "lucide-static/dist/esm/icons/ticket.mjs";
import bus from "lucide-static/dist/esm/icons/bus.mjs";
import copy from "lucide-static/dist/esm/icons/copy.mjs";
import send from "lucide-static/dist/esm/icons/send.mjs";
import messageCircle from "lucide-static/dist/esm/icons/message-circle.mjs";

// 아이콘: Lucide(선 아이콘)에서 쓰는 것만 골라 묶음. icon("heart", 18) → <svg …> 문자열

const SVG = { map, calendar, heart, house, search, plus, x, pin, user, settings, phone, landmark, sunset, trees, waves, utensils, coffee, martini, bag, bed, tram, star, sparkles, chevronDown, up, down, swap, trash, eye, navigation, walk, train, car, clock, upload, download, reset, share, link, logout, check, info, external, calendarPlus, sliders, handshake, plane, globe, camera, listChecks, wallet, receipt, square, checkSquare, users, ticket, bus, copy, send, messageCircle };

export function icon(name, size = 20, extra = "") {
  const svg = SVG[name];
  if (!svg) return "";
  return svg.trim()
    .replace('width="24"', `width="${size}"`).replace('height="24"', `height="${size}"`)
    .replace("<svg", `<svg aria-hidden="true" focusable="false" ${extra}`);
}
