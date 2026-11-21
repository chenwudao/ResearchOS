"""Open the Windows Shell folder picker and return its selection as JSON."""
from contextlib import ExitStack
from ctypes import HRESULT, OleDLL, POINTER, WINFUNCTYPE, WinDLL, byref, c_long, c_ubyte, c_void_p, wstring_at
from ctypes.wintypes import DWORD, HWND, LPCWSTR, ULONG
import json
from uuid import UUID


def guid(value):
    return (c_ubyte * 16).from_buffer_copy(UUID(value).bytes_le)


def pick_directory():
    ole32 = OleDLL("ole32")
    ole32.CoTaskMemFree.restype = None
    ole32.CoUninitialize.restype = None
    user32 = WinDLL("user32")
    user32.SetProcessDPIAware()

    # COM vtable slots for the dialog and its selected item.
    release = WINFUNCTYPE(ULONG)(2, "Release")
    show = WINFUNCTYPE(HRESULT, HWND)(3, "Show")
    set_options = WINFUNCTYPE(HRESULT, DWORD)(9, "SetOptions")
    set_title = WINFUNCTYPE(HRESULT, LPCWSTR)(17, "SetTitle")
    get_result = WINFUNCTYPE(HRESULT, POINTER(c_void_p))(20, "GetResult")
    get_display_name = WINFUNCTYPE(HRESULT, DWORD, POINTER(c_void_p))(5, "GetDisplayName")

    with ExitStack() as cleanup:
        ole32.CoInitializeEx(None, 2)  # COINIT_APARTMENTTHREADED
        cleanup.callback(ole32.CoUninitialize)

        clsid = guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")  # FileOpenDialog
        iid = guid("D57C7288-D4AD-4768-BE02-9D969532D960")  # IFileOpenDialog
        dialog = c_void_p()
        ole32.CoCreateInstance(byref(clsid), None, 1, byref(iid), byref(dialog))
        cleanup.callback(release, dialog)
        set_options(dialog, 0x20 | 0x40 | 0x08)  # FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR
        set_title(dialog, "Select Workspace Directory")

        # Allow the dialog to open in the foreground.
        user32.keybd_event(0x12, 0, 0, 0)  # VK_MENU (Alt)
        user32.keybd_event(0x12, 0, 2, 0)  # KEYEVENTF_KEYUP
        try:
            show(dialog, None)
        except OSError as error:
            if error.winerror == c_long(0x800704C7).value:  # HRESULT_FROM_WIN32(ERROR_CANCELLED)
                return None
            raise

        item = c_void_p()
        get_result(dialog, byref(item))
        cleanup.callback(release, item)
        path = c_void_p()
        get_display_name(item, 0x80058000, byref(path))  # SIGDN_FILESYSPATH
        cleanup.callback(ole32.CoTaskMemFree, path)
        return wstring_at(path)


if __name__ == "__main__":
    print(json.dumps(pick_directory()))
