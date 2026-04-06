use std::{
    collections::HashMap,
    fs::{self, File},
    path::PathBuf,
};

use docx_rs::{
    AbstractNumbering, BreakType, Comment, Document, Docx, Footnote, IndentLevel, Level, LevelJc,
    LevelOverride, LevelText, LineSpacing, LineSpacingType, NumberFormat, Numbering, NumberingId,
    PageMargin, PageSize, Paragraph, Run, RunFonts, SectionProperty, SpecialIndentType, Start,
};
use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeadingScalePayload {
    h1: f32,
    h2: f32,
    h3: f32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportPresetPayload {
    font_family: String,
    font_fallbacks: Vec<String>,
    font_size_pt: f32,
    line_height: f32,
    paragraph_spacing_before_pt: f32,
    paragraph_spacing_after_pt: f32,
    page_size: String,
    margin_top_mm: f32,
    margin_right_mm: f32,
    margin_bottom_mm: f32,
    margin_left_mm: f32,
    heading_scale: HeadingScalePayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportDocxPayload {
    output_path: String,
    document_title: String,
    profile: String,
    editorial_export_json: String,
    preset: ExportPresetPayload,
    include_supplemental_left_annex: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorialExportRulesPayload {
    scholie_role: String,
    right_note_role: String,
    supplemental_left_role: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorialExportTextSegmentPayload {
    text: String,
    bold: bool,
    italic: bool,
    underline: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorialExportManuscriptBlockPayload {
    block_id: String,
    kind: String,
    heading_level: Option<u8>,
    ordered_list: bool,
    list_group_id: Option<String>,
    list_start: Option<usize>,
    text: String,
    segments: Vec<EditorialExportTextSegmentPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorialExportNotePayload {
    margin_block_id: String,
    linked_manuscript_block_id: Option<String>,
    text: String,
    segments: Vec<EditorialExportTextSegmentPayload>,
    has_content: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorialExportSupplementalLeftNotePayload {
    margin_block_id: String,
    linked_manuscript_block_id: Option<String>,
    text: String,
    segments: Vec<EditorialExportTextSegmentPayload>,
    has_content: bool,
    reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorialExportUnitPayload {
    unit_id: String,
    manuscript: EditorialExportManuscriptBlockPayload,
    scholie: Option<EditorialExportNotePayload>,
    right_notes: Vec<EditorialExportNotePayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorialExportDocumentPayload {
    profile: String,
    rules: EditorialExportRulesPayload,
    units: Vec<EditorialExportUnitPayload>,
    supplemental_left_notes: Vec<EditorialExportSupplementalLeftNotePayload>,
}

#[derive(Debug, Clone)]
enum ManuscriptKind {
    Paragraph,
    Heading(u8),
    Quote,
    ListItem { ordered: bool, index: usize },
}

#[derive(Debug, Clone)]
struct ManuscriptBlock {
    block_id: String,
    kind: ManuscriptKind,
    #[allow(dead_code)]
    text: String,
    segments: Vec<StyledTextSegment>,
}

#[derive(Debug, Clone)]
struct MarginBlock {
    margin_block_id: String,
    linked_manuscript_block_id: Option<String>,
    text: String,
    segments: Vec<StyledTextSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct StyledTextSegment {
    text: String,
    bold: bool,
    italic: bool,
    underline: bool,
}

const ORDERED_LIST_ABSTRACT_NUM_ID: usize = 2;
const ORDERED_LIST_NUM_ID: usize = 2;
const BULLET_LIST_ABSTRACT_NUM_ID: usize = 3;
const BULLET_LIST_NUM_ID: usize = 3;

#[tauri::command]
fn pick_save_path(
    app: AppHandle,
    suggested_name: String,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(suggested_name)
        .add_filter("Word Document", &["docx"]);

    if let Some(title) = title {
        dialog = dialog.set_title(title);
    }

    let selected = dialog.blocking_save_file();
    match selected {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|error| error.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn export_docx(payload: ExportDocxPayload) -> Result<String, String> {
    let export_document: EditorialExportDocumentPayload =
        serde_json::from_str(&payload.editorial_export_json)
            .map_err(|error| format!("Invalid editorial export JSON: {error}"))?;

    let section_property = section_property_from_preset(&payload.preset);
    let mut docx = Docx::new()
        .document(Document::new().default_section_property(section_property))
        .default_fonts(default_run_fonts(&payload.preset))
        .default_size(pt_to_half_points(payload.preset.font_size_pt))
        .default_line_spacing(base_line_spacing(&payload.preset))
        .add_abstract_numbering(ordered_list_definition())
        .add_numbering(Numbering::new(
            ORDERED_LIST_NUM_ID,
            ORDERED_LIST_ABSTRACT_NUM_ID,
        ))
        .add_abstract_numbering(clean_bullet_list_definition())
        .add_numbering(Numbering::new(
            BULLET_LIST_NUM_ID,
            BULLET_LIST_ABSTRACT_NUM_ID,
        ));

    let is_working_profile = export_document.profile.eq_ignore_ascii_case("working")
        || payload.profile.eq_ignore_ascii_case("working");
    let use_scholie_comments = export_document
        .rules
        .scholie_role
        .eq_ignore_ascii_case("comment");
    let use_right_footnotes = export_document
        .rules
        .right_note_role
        .eq_ignore_ascii_case("footnote");
    let include_supplemental_left_annex = payload.include_supplemental_left_annex
        && export_document
            .rules
            .supplemental_left_role
            .eq_ignore_ascii_case("annex");

    let mut next_comment_id: usize = 1;
    let mut ordered_list_numberings: HashMap<String, usize> = HashMap::new();
    let mut next_ordered_list_num_id: usize = BULLET_LIST_NUM_ID + 1;

    for unit in &export_document.units {
        let (ordered_list_numbering_id, numbering_override) = resolve_ordered_list_numbering(
            &unit.manuscript,
            &mut ordered_list_numberings,
            &mut next_ordered_list_num_id,
        );
        if let Some(numbering) = numbering_override {
            docx = docx.add_numbering(numbering);
        }

        let block = manuscript_block_from_export(&unit.manuscript);
        let mut paragraph =
            styled_paragraph_from_block(&block, &payload.preset, ordered_list_numbering_id, None);

        if is_working_profile && use_scholie_comments {
            if let Some(annotation) = unit
                .scholie
                .as_ref()
                .filter(|note| note.has_content && !note.text.trim().is_empty())
            {
                let annotation_block = margin_block_from_export(annotation);
                let comment_id = next_comment_id;
                next_comment_id += 1;

                let comment = Comment::new(comment_id).author("Marginalia").add_paragraph(
                    add_styled_runs_to_paragraph(
                        Paragraph::new().line_spacing(base_line_spacing(&payload.preset)),
                        &annotation_block.segments,
                        &payload.preset,
                        1.0,
                        false,
                        false,
                        false,
                        None,
                    ),
                );

                paragraph = styled_paragraph_from_block(
                    &block,
                    &payload.preset,
                    ordered_list_numbering_id,
                    Some(comment),
                );
            }
        }

        if is_working_profile && use_right_footnotes {
            for footnote_note in unit
                .right_notes
                .iter()
                .filter(|note| note.has_content && !note.text.trim().is_empty())
            {
                let footnote_block = margin_block_from_export(footnote_note);
                let footnote = Footnote::new().add_content(add_styled_runs_to_paragraph(
                    Paragraph::new().line_spacing(base_line_spacing(&payload.preset)),
                    &footnote_block.segments,
                    &payload.preset,
                    1.0,
                    false,
                    false,
                    false,
                    None,
                ));
                paragraph = paragraph.add_run(Run::new().add_footnote_reference(footnote));
            }
        }

        docx = docx.add_paragraph(paragraph);
    }

    if is_working_profile && include_supplemental_left_annex {
        let supplemental_left_notes: Vec<&EditorialExportSupplementalLeftNotePayload> =
            export_document
                .supplemental_left_notes
                .iter()
                .filter(|note| note.has_content || !note.text.trim().is_empty())
                .collect();

        if !supplemental_left_notes.is_empty() {
            let annex_heading = Paragraph::new()
                .style("Heading1")
                .line_spacing(base_line_spacing(&payload.preset))
                .add_run(run_from_text(
                    "Supplemental Scholies",
                    &payload.preset,
                    payload.preset.heading_scale.h1,
                    true,
                    false,
                    false,
                ));
            docx = docx.add_paragraph(annex_heading);

            for note in supplemental_left_notes {
                let block = supplemental_left_margin_block_from_export(note);
                let mut paragraph =
                    Paragraph::new().line_spacing(base_line_spacing(&payload.preset));
                paragraph = paragraph.add_run(run_from_text(
                    "\u{2022} ",
                    &payload.preset,
                    1.0,
                    false,
                    false,
                    false,
                ));
                paragraph = paragraph.add_run(run_from_text(
                    &format!("[{}] ", supplemental_left_reason_label(&note.reason)),
                    &payload.preset,
                    1.0,
                    true,
                    false,
                    false,
                ));
                if block.segments.is_empty() {
                    paragraph = paragraph.add_run(run_from_text(
                        &format!("({})", block.margin_block_id),
                        &payload.preset,
                        1.0,
                        false,
                        true,
                        false,
                    ));
                } else {
                    paragraph = add_styled_runs_to_paragraph(
                        paragraph,
                        &block.segments,
                        &payload.preset,
                        1.0,
                        false,
                        false,
                        false,
                        None,
                    );
                }
                docx = docx.add_paragraph(paragraph);
            }
        }
    }

    if export_document.units.is_empty() {
        let fallback_text = if payload.document_title.trim().is_empty() {
            "Untitled Draft"
        } else {
            &payload.document_title
        };
        let fallback = Paragraph::new()
            .line_spacing(base_line_spacing(&payload.preset))
            .add_run(run_from_text(
                fallback_text,
                &payload.preset,
                payload.preset.heading_scale.h1,
                true,
                false,
                false,
            ));
        docx = docx.add_paragraph(fallback);
    }

    let output_path = PathBuf::from(&payload.output_path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let file = File::create(&output_path).map_err(|error| error.to_string())?;
    docx.build().pack(file).map_err(|error| error.to_string())?;

    Ok(output_path.to_string_lossy().into_owned())
}

fn parse_json(raw: &str) -> Result<Value, String> {
    serde_json::from_str(raw).map_err(|error| format!("Invalid Lexical JSON: {error}"))
}

fn read_node_state_string(node: &Value, key: &str) -> Option<String> {
    node.get("$")
        .and_then(|state| state.get(key))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            node.get(key)
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
}

fn node_type(node: &Value) -> &str {
    node.get("type").and_then(Value::as_str).unwrap_or("")
}

const TEXT_FORMAT_BOLD: u64 = 1;
const TEXT_FORMAT_ITALIC: u64 = 1 << 1;
const TEXT_FORMAT_UNDERLINE: u64 = 1 << 3;

fn read_text_format(node: &Value) -> u64 {
    node.get("format")
        .and_then(Value::as_u64)
        .or_else(|| node.get("textFormat").and_then(Value::as_u64))
        .unwrap_or(0)
}

fn extract_text(node: &Value) -> String {
    match node_type(node) {
        "text" => node
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        "linebreak" => "\n".to_string(),
        _ => node
            .get("children")
            .and_then(Value::as_array)
            .map(|children| {
                children
                    .iter()
                    .map(extract_text)
                    .collect::<Vec<String>>()
                    .join("")
            })
            .unwrap_or_default(),
    }
}

fn extract_styled_segments(node: &Value) -> Vec<StyledTextSegment> {
    match node_type(node) {
        "text" => {
            let text = node
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if text.is_empty() {
                return Vec::new();
            }

            let format = read_text_format(node);
            vec![StyledTextSegment {
                text,
                bold: (format & TEXT_FORMAT_BOLD) != 0,
                italic: (format & TEXT_FORMAT_ITALIC) != 0,
                underline: (format & TEXT_FORMAT_UNDERLINE) != 0,
            }]
        }
        "linebreak" => vec![StyledTextSegment {
            text: "\n".to_string(),
            bold: false,
            italic: false,
            underline: false,
        }],
        _ => node
            .get("children")
            .and_then(Value::as_array)
            .map(|children| {
                let mut segments = Vec::new();
                for child in children {
                    segments.extend(extract_styled_segments(child));
                }
                segments
            })
            .unwrap_or_default(),
    }
}

fn normalize_segments(segments: Vec<StyledTextSegment>) -> Vec<StyledTextSegment> {
    let mut normalized: Vec<StyledTextSegment> = Vec::new();

    for segment in segments {
        if segment.text.is_empty() {
            continue;
        }

        if let Some(last) = normalized.last_mut() {
            if last.bold == segment.bold
                && last.italic == segment.italic
                && last.underline == segment.underline
            {
                last.text.push_str(&segment.text);
                continue;
            }
        }

        normalized.push(segment);
    }

    normalized
}

fn normalize_text(text: String) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<&str>>()
        .join("\n")
}

fn styled_segments_from_export(
    segments: &[EditorialExportTextSegmentPayload],
) -> Vec<StyledTextSegment> {
    normalize_segments(
        segments
            .iter()
            .filter(|segment| !segment.text.is_empty())
            .map(|segment| StyledTextSegment {
                text: segment.text.clone(),
                bold: segment.bold,
                italic: segment.italic,
                underline: segment.underline,
            })
            .collect(),
    )
}

fn manuscript_block_from_export(block: &EditorialExportManuscriptBlockPayload) -> ManuscriptBlock {
    let kind = match block.kind.as_str() {
        "heading" => ManuscriptKind::Heading(block.heading_level.unwrap_or(1)),
        "quote" => ManuscriptKind::Quote,
        "list-item" => ManuscriptKind::ListItem {
            ordered: block.ordered_list,
            index: 1,
        },
        _ => ManuscriptKind::Paragraph,
    };

    ManuscriptBlock {
        block_id: block.block_id.clone(),
        kind,
        text: block.text.clone(),
        segments: styled_segments_from_export(&block.segments),
    }
}

fn resolve_ordered_list_numbering(
    block: &EditorialExportManuscriptBlockPayload,
    ordered_list_numberings: &mut HashMap<String, usize>,
    next_ordered_list_num_id: &mut usize,
) -> (Option<usize>, Option<Numbering>) {
    if block.kind != "list-item" || !block.ordered_list {
        return (None, None);
    }

    let Some(list_group_id) = block.list_group_id.as_ref() else {
        return (Some(ORDERED_LIST_NUM_ID), None);
    };

    if let Some(numbering_id) = ordered_list_numberings.get(list_group_id) {
        return (Some(*numbering_id), None);
    }

    let numbering_id = *next_ordered_list_num_id;
    *next_ordered_list_num_id += 1;
    ordered_list_numberings.insert(list_group_id.clone(), numbering_id);

    let numbering = Numbering::new(numbering_id, ORDERED_LIST_ABSTRACT_NUM_ID)
        .add_override(LevelOverride::new(0).start(block.list_start.unwrap_or(1).max(1)));

    (Some(numbering_id), Some(numbering))
}

fn margin_block_from_export(note: &EditorialExportNotePayload) -> MarginBlock {
    MarginBlock {
        margin_block_id: note.margin_block_id.clone(),
        linked_manuscript_block_id: note.linked_manuscript_block_id.clone(),
        text: note.text.clone(),
        segments: styled_segments_from_export(&note.segments),
    }
}

fn supplemental_left_margin_block_from_export(
    note: &EditorialExportSupplementalLeftNotePayload,
) -> MarginBlock {
    MarginBlock {
        margin_block_id: note.margin_block_id.clone(),
        linked_manuscript_block_id: note.linked_manuscript_block_id.clone(),
        text: note.text.clone(),
        segments: styled_segments_from_export(&note.segments),
    }
}

fn supplemental_left_reason_label(reason: &str) -> &'static str {
    match reason {
        "duplicate-left-link" => "Legacy duplicate",
        "stale-left-link" => "Stale link",
        "unlinked-left-note" => "Free scholie",
        _ => "Supplemental scholie",
    }
}

fn root_children<'a>(json: &'a Value) -> &'a [Value] {
    json.get("root")
        .and_then(|root| root.get("children"))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn parse_manuscript_blocks(json: &Value) -> Vec<ManuscriptBlock> {
    let mut blocks = Vec::new();

    for node in root_children(json) {
        parse_manuscript_node(node, &mut blocks);
    }

    blocks
}

fn parse_manuscript_node(node: &Value, output: &mut Vec<ManuscriptBlock>) {
    match node_type(node) {
        "paragraph" => {
            let segments = normalize_segments(extract_styled_segments(node));
            output.push(ManuscriptBlock {
                block_id: read_node_state_string(node, "blockId")
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                kind: ManuscriptKind::Paragraph,
                text: normalize_text(extract_text(node)),
                segments,
            });
        }
        "heading" => {
            let level = match node.get("tag").and_then(Value::as_str).unwrap_or("h1") {
                "h2" => 2,
                "h3" => 3,
                _ => 1,
            };
            let segments = normalize_segments(extract_styled_segments(node));
            output.push(ManuscriptBlock {
                block_id: read_node_state_string(node, "blockId")
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                kind: ManuscriptKind::Heading(level),
                text: normalize_text(extract_text(node)),
                segments,
            });
        }
        "quote" => {
            let segments = normalize_segments(extract_styled_segments(node));
            output.push(ManuscriptBlock {
                block_id: read_node_state_string(node, "blockId")
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                kind: ManuscriptKind::Quote,
                text: normalize_text(extract_text(node)),
                segments,
            });
        }
        "list" => {
            let ordered = node
                .get("listType")
                .and_then(Value::as_str)
                .map(|value| value == "number")
                .unwrap_or(false);
            let mut index = 1usize;
            if let Some(items) = node.get("children").and_then(Value::as_array) {
                for item in items {
                    if node_type(item) != "listitem" {
                        continue;
                    }
                    let segments = normalize_segments(extract_styled_segments(item));
                    output.push(ManuscriptBlock {
                        block_id: read_node_state_string(item, "blockId")
                            .unwrap_or_else(|| Uuid::new_v4().to_string()),
                        kind: ManuscriptKind::ListItem { ordered, index },
                        text: normalize_text(extract_text(item)),
                        segments,
                    });
                    index += 1;
                }
            }
        }
        "listitem" => {
            let segments = normalize_segments(extract_styled_segments(node));
            output.push(ManuscriptBlock {
                block_id: read_node_state_string(node, "blockId")
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                kind: ManuscriptKind::ListItem {
                    ordered: false,
                    index: 1,
                },
                text: normalize_text(extract_text(node)),
                segments,
            });
        }
        _ => {}
    }
}

fn parse_margin_blocks(json: &Value) -> Vec<MarginBlock> {
    let mut blocks = Vec::new();

    for node in root_children(json) {
        if node_type(node) != "marginalia-block" {
            continue;
        }

        let margin_block_id = node
            .get("marginBlockId")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let linked_manuscript_block_id = node
            .get("linkedManuscriptBlockId")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        let segments = normalize_segments(extract_styled_segments(node));

        blocks.push(MarginBlock {
            margin_block_id,
            linked_manuscript_block_id,
            text: normalize_text(extract_text(node)),
            segments,
        });
    }

    blocks
}

fn group_margin_blocks(
    blocks: Vec<MarginBlock>,
) -> (HashMap<String, Vec<MarginBlock>>, Vec<MarginBlock>) {
    let mut linked: HashMap<String, Vec<MarginBlock>> = HashMap::new();
    let mut unlinked = Vec::new();

    for block in blocks {
        if let Some(manuscript_block_id) = &block.linked_manuscript_block_id {
            linked
                .entry(manuscript_block_id.clone())
                .or_default()
                .push(block);
        } else {
            unlinked.push(block);
        }
    }

    (linked, unlinked)
}

fn mm_to_twips(mm: f32) -> i32 {
    ((mm.max(0.0) / 25.4) * 1440.0).round() as i32
}

fn pt_to_twips_u32(pt: f32) -> u32 {
    (pt.max(0.0) * 20.0).round() as u32
}

fn pt_to_half_points(pt: f32) -> usize {
    (pt.max(1.0) * 2.0).round() as usize
}

fn default_run_fonts(preset: &ExportPresetPayload) -> RunFonts {
    let fallback = preset
        .font_fallbacks
        .first()
        .cloned()
        .unwrap_or_else(|| preset.font_family.clone());
    let family = if preset.font_family.trim().is_empty() {
        fallback
    } else {
        preset.font_family.clone()
    };

    RunFonts::new()
        .ascii(family.clone())
        .hi_ansi(family.clone())
        .east_asia(family.clone())
        .cs(family)
}

fn base_line_spacing(preset: &ExportPresetPayload) -> LineSpacing {
    LineSpacing::new()
        .before(pt_to_twips_u32(preset.paragraph_spacing_before_pt))
        .after(pt_to_twips_u32(preset.paragraph_spacing_after_pt))
        .line_rule(LineSpacingType::Auto)
        .line((preset.line_height.max(1.0) * 240.0).round() as i32)
}

fn section_property_from_preset(preset: &ExportPresetPayload) -> SectionProperty {
    let (width, height) = if preset.page_size.eq_ignore_ascii_case("letter") {
        (12240u32, 15840u32)
    } else {
        (11906u32, 16838u32)
    };

    let margin = PageMargin::new()
        .top(mm_to_twips(preset.margin_top_mm))
        .right(mm_to_twips(preset.margin_right_mm))
        .bottom(mm_to_twips(preset.margin_bottom_mm))
        .left(mm_to_twips(preset.margin_left_mm));

    SectionProperty::new()
        .page_size(PageSize::new().size(width, height))
        .page_margin(margin)
}

fn ordered_list_definition() -> AbstractNumbering {
    AbstractNumbering::new(ORDERED_LIST_ABSTRACT_NUM_ID).add_level(
        Level::new(
            0,
            Start::new(1),
            NumberFormat::new("decimal"),
            LevelText::new("%1."),
            LevelJc::new("left"),
        )
        .indent(Some(720), Some(SpecialIndentType::Hanging(360)), None, None),
    )
}

#[allow(dead_code)]
fn bullet_list_definition() -> AbstractNumbering {
    AbstractNumbering::new(BULLET_LIST_ABSTRACT_NUM_ID).add_level(
        Level::new(
            0,
            Start::new(1),
            NumberFormat::new("bullet"),
            LevelText::new("•"),
            LevelJc::new("left"),
        )
        .indent(Some(720), Some(SpecialIndentType::Hanging(360)), None, None),
    )
}

fn clean_bullet_list_definition() -> AbstractNumbering {
    AbstractNumbering::new(BULLET_LIST_ABSTRACT_NUM_ID).add_level(
        Level::new(
            0,
            Start::new(1),
            NumberFormat::new("bullet"),
            LevelText::new("\u{2022}"),
            LevelJc::new("left"),
        )
        .indent(Some(720), Some(SpecialIndentType::Hanging(360)), None, None),
    )
}

fn run_from_text(
    text: &str,
    preset: &ExportPresetPayload,
    scale: f32,
    bold: bool,
    italic: bool,
    underline: bool,
) -> Run {
    let mut run = Run::new()
        .add_text(text)
        .fonts(default_run_fonts(preset))
        .size(pt_to_half_points(preset.font_size_pt * scale.max(0.6)));

    if bold {
        run = run.bold();
    }
    if italic {
        run = run.italic();
    }
    if underline {
        run = run.underline("single");
    }

    run
}

fn add_styled_runs_to_paragraph(
    mut paragraph: Paragraph,
    segments: &[StyledTextSegment],
    preset: &ExportPresetPayload,
    scale: f32,
    default_bold: bool,
    default_italic: bool,
    default_underline: bool,
    comment_anchor: Option<Comment>,
) -> Paragraph {
    let mut pending_comment = comment_anchor;
    let mut pending_comment_id = pending_comment.as_ref().map(Comment::id);

    for segment in segments {
        let parts: Vec<&str> = segment.text.split('\n').collect();

        for (index, part) in parts.iter().enumerate() {
            if !part.is_empty() {
                if let Some(comment) = pending_comment.take() {
                    paragraph = paragraph.add_comment_start(comment);
                }
                paragraph = paragraph.add_run(run_from_text(
                    part,
                    preset,
                    scale,
                    default_bold || segment.bold,
                    default_italic || segment.italic,
                    default_underline || segment.underline,
                ));
                if let Some(comment_id) = pending_comment_id.take() {
                    paragraph = paragraph.add_comment_end(comment_id);
                }
            }

            if index + 1 < parts.len() {
                paragraph = paragraph.add_run(Run::new().add_break(BreakType::TextWrapping));
            }
        }
    }

    if let Some(comment) = pending_comment.take() {
        paragraph = paragraph.add_comment_start(comment);
        paragraph = paragraph.add_run(run_from_text(
            "\u{2060}",
            preset,
            scale,
            default_bold,
            default_italic,
            default_underline,
        ));
        if let Some(comment_id) = pending_comment_id.take() {
            paragraph = paragraph.add_comment_end(comment_id);
        }
    }

    paragraph
}

#[allow(dead_code)]
fn paragraph_from_block(block: &ManuscriptBlock, preset: &ExportPresetPayload) -> Paragraph {
    let mut paragraph = Paragraph::new().line_spacing(base_line_spacing(preset));

    match block.kind {
        ManuscriptKind::Paragraph => {
            paragraph.add_run(run_from_text(&block.text, preset, 1.0, false, false, false))
        }
        ManuscriptKind::Heading(level) => {
            let (style, scale) = match level {
                2 => ("Heading2", preset.heading_scale.h2),
                3 => ("Heading3", preset.heading_scale.h3),
                _ => ("Heading1", preset.heading_scale.h1),
            };
            paragraph = paragraph.style(style);
            paragraph.add_run(run_from_text(
                &block.text,
                preset,
                scale,
                true,
                false,
                false,
            ))
        }
        ManuscriptKind::Quote => {
            paragraph = paragraph.style("Quote");
            paragraph.add_run(run_from_text(&block.text, preset, 1.0, false, true, false))
        }
        ManuscriptKind::ListItem { ordered, index } => {
            let prefix = if ordered {
                format!("{index}. ")
            } else {
                "• ".to_string()
            };
            paragraph.add_run(run_from_text(
                &format!("{prefix}{}", block.text),
                preset,
                1.0,
                false,
                false,
                false,
            ))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    {
        if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--disable-gpu --disable-gpu-compositing",
            );
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![pick_save_path, export_docx])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_manuscript_blocks_reads_headings_quotes_and_lists() {
        let json = json!({
            "root": {
                "children": [
                    {
                        "type": "heading",
                        "tag": "h2",
                        "$": { "blockId": "h-1" },
                        "children": [{ "type": "text", "text": "Heading" }]
                    },
                    {
                        "type": "quote",
                        "$": { "blockId": "q-1" },
                        "children": [{ "type": "text", "text": "Quoted" }]
                    },
                    {
                        "type": "list",
                        "listType": "number",
                        "children": [
                            {
                                "type": "listitem",
                                "$": { "blockId": "l-1" },
                                "children": [{ "type": "text", "text": "First item" }]
                            }
                        ]
                    }
                ]
            }
        });

        let blocks = parse_manuscript_blocks(&json);

        assert_eq!(blocks.len(), 3);
        assert!(matches!(blocks[0].kind, ManuscriptKind::Heading(2)));
        assert_eq!(blocks[0].block_id, "h-1");
        assert_eq!(blocks[0].text, "Heading");
        assert_eq!(
            blocks[0].segments,
            vec![StyledTextSegment {
                text: "Heading".into(),
                bold: false,
                italic: false,
                underline: false,
            }]
        );
        assert!(matches!(blocks[1].kind, ManuscriptKind::Quote));
        assert_eq!(blocks[1].block_id, "q-1");
        assert!(matches!(
            blocks[2].kind,
            ManuscriptKind::ListItem {
                ordered: true,
                index: 1
            }
        ));
        assert_eq!(blocks[2].block_id, "l-1");
        assert_eq!(blocks[2].text, "First item");
    }

    #[test]
    fn parse_margin_blocks_reads_links_and_text() {
        let json = json!({
            "root": {
                "children": [
                    {
                        "type": "marginalia-block",
                        "marginBlockId": "m-left-1",
                        "linkedManuscriptBlockId": "paragraph-1",
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [{ "type": "text", "text": "Linked note" }]
                            }
                        ]
                    },
                    {
                        "type": "marginalia-block",
                        "marginBlockId": "m-left-2",
                        "linkedManuscriptBlockId": null,
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [{ "type": "text", "text": "Loose note" }]
                            }
                        ]
                    }
                ]
            }
        });

        let blocks = parse_margin_blocks(&json);

        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].margin_block_id, "m-left-1");
        assert_eq!(
            blocks[0].linked_manuscript_block_id.as_deref(),
            Some("paragraph-1")
        );
        assert_eq!(blocks[0].text, "Linked note");
        assert_eq!(
            blocks[0].segments,
            vec![StyledTextSegment {
                text: "Linked note".into(),
                bold: false,
                italic: false,
                underline: false,
            }]
        );
        assert_eq!(blocks[1].linked_manuscript_block_id, None);
        assert_eq!(blocks[1].text, "Loose note");
    }

    #[test]
    fn parse_manuscript_blocks_preserves_inline_styles_and_linebreaks() {
        let json = json!({
            "root": {
                "children": [
                    {
                        "type": "paragraph",
                        "$": { "blockId": "p-1" },
                        "children": [
                            { "type": "text", "text": "Bold", "format": 1 },
                            { "type": "text", "text": " plain", "format": 0 },
                            { "type": "linebreak" },
                            { "type": "text", "text": "Under", "format": 8 },
                            { "type": "text", "text": " italic", "format": 2 }
                        ]
                    }
                ]
            }
        });

        let blocks = parse_manuscript_blocks(&json);

        assert_eq!(blocks.len(), 1);
        assert_eq!(
            blocks[0].segments,
            vec![
                StyledTextSegment {
                    text: "Bold".into(),
                    bold: true,
                    italic: false,
                    underline: false,
                },
                StyledTextSegment {
                    text: " plain\n".into(),
                    bold: false,
                    italic: false,
                    underline: false,
                },
                StyledTextSegment {
                    text: "Under".into(),
                    bold: false,
                    italic: false,
                    underline: true,
                },
                StyledTextSegment {
                    text: " italic".into(),
                    bold: false,
                    italic: true,
                    underline: false,
                }
            ]
        );
    }

    #[test]
    fn group_margin_blocks_separates_linked_and_unlinked_blocks() {
        let blocks = vec![
            MarginBlock {
                margin_block_id: "a".into(),
                linked_manuscript_block_id: Some("m-1".into()),
                text: "One".into(),
                segments: vec![],
            },
            MarginBlock {
                margin_block_id: "b".into(),
                linked_manuscript_block_id: Some("m-1".into()),
                text: "Two".into(),
                segments: vec![],
            },
            MarginBlock {
                margin_block_id: "c".into(),
                linked_manuscript_block_id: None,
                text: "Three".into(),
                segments: vec![],
            },
        ];

        let (linked, unlinked) = group_margin_blocks(blocks);

        assert_eq!(linked.len(), 1);
        assert_eq!(linked["m-1"].len(), 2);
        assert_eq!(unlinked.len(), 1);
        assert_eq!(unlinked[0].margin_block_id, "c");
    }

    #[test]
    fn normalize_text_removes_blank_lines_and_trims_each_line() {
        let normalized = normalize_text("  First \n\n  Second  \n   \nThird ".into());
        assert_eq!(normalized, "First\nSecond\nThird");
    }

    #[test]
    fn styled_segments_from_export_preserves_inline_styles_and_linebreaks() {
        let segments = styled_segments_from_export(&[
            EditorialExportTextSegmentPayload {
                text: "Bold".into(),
                bold: true,
                italic: false,
                underline: false,
            },
            EditorialExportTextSegmentPayload {
                text: "\nplain".into(),
                bold: false,
                italic: false,
                underline: false,
            },
            EditorialExportTextSegmentPayload {
                text: " under".into(),
                bold: false,
                italic: false,
                underline: true,
            },
        ]);

        assert_eq!(
            segments,
            vec![
                StyledTextSegment {
                    text: "Bold".into(),
                    bold: true,
                    italic: false,
                    underline: false,
                },
                StyledTextSegment {
                    text: "\nplain".into(),
                    bold: false,
                    italic: false,
                    underline: false,
                },
                StyledTextSegment {
                    text: " under".into(),
                    bold: false,
                    italic: false,
                    underline: true,
                },
            ]
        );
    }

    #[test]
    fn supplemental_left_margin_block_from_export_keeps_styled_segments() {
        let block = supplemental_left_margin_block_from_export(
            &EditorialExportSupplementalLeftNotePayload {
                margin_block_id: "left-1".into(),
                linked_manuscript_block_id: None,
                text: "Free scholie".into(),
                segments: vec![
                    EditorialExportTextSegmentPayload {
                        text: "Free".into(),
                        bold: true,
                        italic: false,
                        underline: false,
                    },
                    EditorialExportTextSegmentPayload {
                        text: "\nsholie".into(),
                        bold: false,
                        italic: true,
                        underline: false,
                    },
                ],
                has_content: true,
                reason: "unlinked-left-note".into(),
            },
        );

        assert_eq!(block.margin_block_id, "left-1");
        assert_eq!(block.text, "Free scholie");
        assert_eq!(
            block.segments,
            vec![
                StyledTextSegment {
                    text: "Free".into(),
                    bold: true,
                    italic: false,
                    underline: false,
                },
                StyledTextSegment {
                    text: "\nsholie".into(),
                    bold: false,
                    italic: true,
                    underline: false,
                },
            ]
        );
    }

    #[test]
    fn resolve_ordered_list_numbering_reuses_group_ids_and_preserves_start() {
        let mut ordered_list_numberings = HashMap::new();
        let mut next_ordered_list_num_id = BULLET_LIST_NUM_ID + 1;

        let first_block = EditorialExportManuscriptBlockPayload {
            block_id: "list-a-1".into(),
            kind: "list-item".into(),
            heading_level: None,
            ordered_list: true,
            list_group_id: Some("list-a-1".into()),
            list_start: Some(3),
            text: "Third item".into(),
            segments: vec![],
        };
        let second_block = EditorialExportManuscriptBlockPayload {
            block_id: "list-a-2".into(),
            kind: "list-item".into(),
            heading_level: None,
            ordered_list: true,
            list_group_id: Some("list-a-1".into()),
            list_start: Some(3),
            text: "Fourth item".into(),
            segments: vec![],
        };
        let third_block = EditorialExportManuscriptBlockPayload {
            block_id: "list-b-1".into(),
            kind: "list-item".into(),
            heading_level: None,
            ordered_list: true,
            list_group_id: Some("list-b-1".into()),
            list_start: Some(1),
            text: "Fresh first item".into(),
            segments: vec![],
        };

        let (first_numbering_id, first_override) = resolve_ordered_list_numbering(
            &first_block,
            &mut ordered_list_numberings,
            &mut next_ordered_list_num_id,
        );
        let (second_numbering_id, second_override) = resolve_ordered_list_numbering(
            &second_block,
            &mut ordered_list_numberings,
            &mut next_ordered_list_num_id,
        );
        let (third_numbering_id, third_override) = resolve_ordered_list_numbering(
            &third_block,
            &mut ordered_list_numberings,
            &mut next_ordered_list_num_id,
        );

        assert_eq!(first_numbering_id, Some(BULLET_LIST_NUM_ID + 1));
        assert_eq!(second_numbering_id, first_numbering_id);
        assert_eq!(third_numbering_id, Some(BULLET_LIST_NUM_ID + 2));
        assert!(second_override.is_none());

        let first_override = first_override.expect("first group should register an override");
        let third_override = third_override.expect("second group should register an override");
        assert_eq!(
            first_override.level_overrides,
            vec![LevelOverride::new(0).start(3)]
        );
        assert_eq!(
            third_override.level_overrides,
            vec![LevelOverride::new(0).start(1)]
        );
    }
}

fn styled_paragraph_from_block(
    block: &ManuscriptBlock,
    preset: &ExportPresetPayload,
    ordered_list_numbering_id: Option<usize>,
    comment_anchor: Option<Comment>,
) -> Paragraph {
    let mut paragraph = Paragraph::new().line_spacing(base_line_spacing(preset));

    match block.kind {
        ManuscriptKind::Paragraph => add_styled_runs_to_paragraph(
            paragraph,
            &block.segments,
            preset,
            1.0,
            false,
            false,
            false,
            comment_anchor,
        ),
        ManuscriptKind::Heading(level) => {
            let (style, scale) = match level {
                2 => ("Heading2", preset.heading_scale.h2),
                3 => ("Heading3", preset.heading_scale.h3),
                _ => ("Heading1", preset.heading_scale.h1),
            };
            paragraph = paragraph.style(style);
            add_styled_runs_to_paragraph(
                paragraph,
                &block.segments,
                preset,
                scale,
                true,
                false,
                false,
                comment_anchor,
            )
        }
        ManuscriptKind::Quote => {
            paragraph = paragraph.style("Quote");
            add_styled_runs_to_paragraph(
                paragraph,
                &block.segments,
                preset,
                1.0,
                false,
                true,
                false,
                comment_anchor,
            )
        }
        ManuscriptKind::ListItem { ordered, index: _ } => {
            paragraph = if ordered {
                paragraph.numbering(
                    NumberingId::new(ordered_list_numbering_id.unwrap_or(ORDERED_LIST_NUM_ID)),
                    IndentLevel::new(0),
                )
            } else {
                paragraph.numbering(NumberingId::new(BULLET_LIST_NUM_ID), IndentLevel::new(0))
            };
            add_styled_runs_to_paragraph(
                paragraph,
                &block.segments,
                preset,
                1.0,
                false,
                false,
                false,
                comment_anchor,
            )
        }
    }
}
