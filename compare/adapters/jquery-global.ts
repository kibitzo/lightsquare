// chessboard.js reads jQuery from the page when its file loads: put it there first.
import jQuery from "jquery";

(window as unknown as { jQuery: typeof jQuery }).jQuery = jQuery;
